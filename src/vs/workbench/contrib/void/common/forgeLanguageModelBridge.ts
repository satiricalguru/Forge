/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Forge IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * ForgeLanguageModelBridge
 *
 * Registers Forge's local LLM providers (Ollama, LM Studio, vLLM, llama.cpp, LocalAI)
 * with VS Code's native ILanguageModelsService so they appear in the built-in Chat /
 * Agents panel.
 *
 * Architecture:
 *   ILocalProviderRegistryService  →  onDidChangeHealth
 *         ↓
 *   [fetch model list for healthy providers]
 *         ↓
 *   ILanguageModelsService.registerLanguageModelChat()
 *         (one entry per discovered model)
 *
 * Each model is registered as:
 *   vendor  : 'forge'
 *   family  : <provider id>  (e.g. 'ollama')
 *   id      : '<provider>/<model>'
 *   name    : '<ModelName> (via <Provider>)'
 *
 * The bridge tears down registrations for providers that become unhealthy and
 * rebuilds them when they recover.
 */

import { AsyncIterableSource } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	ChatMessageRole,
	IChatMessage,
	IChatResponseFragment,
	ILanguageModelChat,
	ILanguageModelChatResponse,
	ILanguageModelsService,
} from '../../chat/common/languageModels.js';
import { ChatRequest, ChatStreamHandle, StreamChunk } from './forgeProviderTypes.js';
import { ILocalProviderRegistryService } from './forgeProviderTypes.js';
import { ProviderName } from './voidSettingsTypes.js';

// ── Constants ────────────────────────────────────────────────────────────────

const FORGE_VENDOR = 'forge';

/** Synthetic ExtensionIdentifier used when Forge itself is the "caller". */
const FORGE_EXTENSION_ID = new ExtensionIdentifier('forge-ide.forge');

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeModelId(providerId: string, modelId: string): string {
	// Identifiers must be unique across all registered providers.
	// Use a safe slug that avoids characters that can trip up consumers.
	return `forge/${providerId}/${modelId.replace(/[^a-zA-Z0-9._\-]/g, '_')}`;
}

/**
 * Map VS Code IChatMessage → Forge ChatRequest messages.
 * VS Code uses a richer part-based format; we flatten to strings.
 */
function toForgeChatMessages(messages: IChatMessage[]): ChatRequest['messages'] {
	const result: ChatRequest['messages'] = [];
	for (const msg of messages) {
		let role: 'system' | 'user' | 'assistant';
		switch (msg.role) {
			case ChatMessageRole.System: role = 'system'; break;
			case ChatMessageRole.User: role = 'user'; break;
			case ChatMessageRole.Assistant: role = 'assistant'; break;
			default: role = 'user';
		}

		// Flatten content parts to a single string
		const text = msg.content
			.filter(p => p.type === 'text')
			.map(p => (p as { type: 'text'; value: string }).value)
			.join('');

		result.push({ role, content: text } as any);
	}
	return result;
}

// ── Service interface (trivial – exists only for DI) ─────────────────────────

export interface IForgeLanguageModelBridge {
	readonly _serviceBrand: undefined;
}

export const IForgeLanguageModelBridge =
	createDecorator<IForgeLanguageModelBridge>('forgeLanguageModelBridge');

// ── Bridge implementation ────────────────────────────────────────────────────

export class ForgeLanguageModelBridge extends Disposable implements IForgeLanguageModelBridge {
	readonly _serviceBrand: undefined;

	/**
	 * Active registrations keyed by `<providerId>/<modelId>`.
	 * We keep a DisposableStore per provider so we can tear down all of a
	 * provider's models atomically when it goes unhealthy.
	 */
	private readonly _registrationsByProvider = new Map<string, DisposableStore>();

	/**
	 * Disposable returned by registerVendorDirect() — kept alive for the
	 * lifetime of the bridge so the vendor stays registered.
	 */
	private _vendorRegistration: IDisposable | undefined;

	constructor(
		@ILocalProviderRegistryService private readonly _providerRegistryService: ILocalProviderRegistryService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _log: ILogService,
	) {
		super();

		// Register the 'forge' vendor once so registerLanguageModelChat() won't throw.
		this._vendorRegistration = this._languageModelsService.registerVendorDirect(FORGE_VENDOR);
		this._register(toDisposable(() => this._vendorRegistration?.dispose()));

		// React to health changes: register models when healthy, tear down when not.
		this._register(
			this._providerRegistryService.onDidChangeHealth(({ providerId, health }) => {
				if (health.status === 'healthy') {
					this._syncProvider(providerId as ProviderName);
				} else if (health.status === 'unhealthy' || health.status === 'unknown') {
					this._teardownProvider(providerId);
				}
			})
		);

		// Initial sync: pick up providers that are already healthy.
		for (const [providerId, health] of this._providerRegistryService.getAllHealth()) {
			if (health.status === 'healthy') {
				this._syncProvider(providerId as ProviderName);
			}
		}
	}

	// ── Internal helpers ──────────────────────────────────────────────────────

	private _teardownProvider(providerId: string): void {
		const store = this._registrationsByProvider.get(providerId);
		if (store) {
			store.dispose();
			this._registrationsByProvider.delete(providerId);
			this._log.trace(`[ForgeLanguageModelBridge] Tore down models for provider: ${providerId}`);
		}
	}

	private async _syncProvider(providerName: ProviderName): Promise<void> {
		try {
			const { models } = await this._providerRegistryService.listModelsFor(providerName);
			if (models.length === 0) return;

			// Tear down old registrations first (model list may have changed).
			this._teardownProvider(providerName);

			const store = new DisposableStore();
			this._registrationsByProvider.set(providerName, store);

			for (const model of models) {
				const identifier = safeModelId(providerName, model.id);

				// Skip if already registered (race guard).
				if (this._languageModelsService.lookupLanguageModel(identifier)) {
					continue;
				}

				const provider = this._providerRegistryService.providerFor(providerName);
				if (!provider) continue;

				const caps = this._providerRegistryService.capabilitiesFor(providerName, model.id);

				const lmProvider: ILanguageModelChat = {
					metadata: {
						extension: FORGE_EXTENSION_ID,
						id: model.id,
						name: `${model.id} (via ${providerName})`,
						vendor: FORGE_VENDOR,
						version: '1.0',
						family: providerName,
						maxInputTokens: caps.contextWindow ?? 8192,
						maxOutputTokens: caps.reservedOutputTokens ?? 2048,
						isDefault: false,
						isUserSelectable: true,
						capabilities: {
							toolCalling: caps.supportsTools,
							agentMode: caps.supportsTools,
							vision: caps.supportsVision,
						},
					},

					sendChatRequest: (messages, _from, _options, token) =>
						this._sendRequest(provider, model.id, messages, token),

					provideTokenCount: async (msg, _token) => {
						// Very rough estimate: 1 token ≈ 4 chars
						const text = typeof msg === 'string' ? msg
							: msg.content
								.filter(p => p.type === 'text')
								.map(p => (p as any).value as string)
								.join('');
						return Math.ceil(text.length / 4);
					},
				};

				try {
					const reg = this._languageModelsService.registerLanguageModelChat(identifier, lmProvider);
					store.add(reg);
					this._log.trace(`[ForgeLanguageModelBridge] Registered model: ${identifier}`);
				} catch (err) {
					this._log.warn(`[ForgeLanguageModelBridge] Failed to register model ${identifier}:`, err);
				}
			}
		} catch (err) {
			this._log.warn(`[ForgeLanguageModelBridge] _syncProvider(${providerName}) failed:`, err);
		}
	}

	private _sendRequest(
		provider: import('./forgeProviderTypes.js').ILocalProvider,
		modelId: string,
		messages: IChatMessage[],
		token: CancellationToken,
	): Promise<ILanguageModelChatResponse> {
		const stream = new AsyncIterableSource<IChatResponseFragment>();

		const abortController = new AbortController();

		// Wire VS Code cancellation → AbortController
		const cancelListener = token.onCancellationRequested(() => {
			abortController.abort();
			stream.resolve();
		});

		const forgeMessages = toForgeChatMessages(messages);

		let handlePromise: Promise<ChatStreamHandle>;
		try {
			handlePromise = provider.streamChat(
				{
					model: modelId,
					messages: forgeMessages,
					signal: abortController.signal,
				},
				(chunk: StreamChunk) => {
					if (chunk.kind === 'text' && chunk.text) {
						stream.emitOne({
							index: 0,
							part: { type: 'text', value: chunk.text },
						});
					}
					// Reasoning chunks are surfaced as text with a prefix so they
					// are visible in the chat UI without a dedicated part type.
					if (chunk.kind === 'reasoning' && chunk.text) {
						stream.emitOne({
							index: 0,
							part: { type: 'text', value: chunk.text },
						});
					}
				}
			);
		} catch (err) {
			cancelListener.dispose();
			stream.reject(err instanceof Error ? err : new Error(String(err)));
			return Promise.resolve({
				stream: stream.asyncIterable,
				result: Promise.reject(err),
			});
		}

		const result = handlePromise.then(async handle => {
			await handle.finished;
		}).catch(err => {
			stream.reject(err instanceof Error ? err : new Error(String(err)));
			throw err;
		}).finally(() => {
			cancelListener.dispose();
			stream.resolve();
		});

		return Promise.resolve({
			stream: stream.asyncIterable,
			result,
		} satisfies ILanguageModelChatResponse);
	}
}

// Register eagerly so providers are available immediately after the workbench
// contribution phase completes.
registerSingleton(IForgeLanguageModelBridge, ForgeLanguageModelBridge, InstantiationType.Eager);
