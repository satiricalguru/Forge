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
import { ChatRequest, ChatStreamHandle, StreamChunk, ILocalProviderRegistryService } from './forgeProviderTypes.js';
import { ProviderName } from './voidSettingsTypes.js';

// ── Constants ────────────────────────────────────────────────────────────────

const FORGE_VENDOR = 'forge';

/** Synthetic ExtensionIdentifier used when Forge itself is the "caller". */
const FORGE_EXTENSION_ID = new ExtensionIdentifier('forge-ide.forge');

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeModelId(providerId: string, modelId: string, existing: ReadonlySet<string>): string {
	// Identifiers must be unique across all registered providers. A slug can
	// collide (e.g. `qwen2.5:7b` and `qwen2.5_7b` both slugify identically), so
	// append a short hash of the original id to guarantee uniqueness.
	let slug = modelId.replace(/[^a-zA-Z0-9._\-]/g, '_');
	if (existing.has(`forge/${providerId}/${slug}`)) {
		let hash = 0;
		for (let i = 0; i < modelId.length; i++) {
			hash = ((hash << 5) - hash + modelId.charCodeAt(i)) | 0;
		}
		slug = `${slug}-${(hash >>> 0).toString(36)}`;
	}
	return `forge/${providerId}/${slug}`;
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

	/**
	 * `_syncProvider` is serialized per provider so two overlapping syncs can
	 * never tear down a store that the other one is still registering into.
	 */
	private readonly _syncChainByProvider = new Map<string, Promise<void>>();

	/** Model-list signature (ids joined) per provider, used to skip no-op re-syncs. */
	private readonly _modelSignatureByProvider = new Map<string, string>();

	/** Identifiers currently registered per provider (used to disambiguate slug collisions). */
	private readonly _registeredIdsByProvider = new Map<string, Set<string>>();

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
					// listModelsFor re-fetches, but _syncProvider no-ops unless the
					// model list actually changed — so this stays cheap when nothing
					// changed and still catches models being pulled/removed.
					this._syncProvider(providerId as ProviderName);
				} else if (health.status === 'unhealthy') {
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
			this._registeredIdsByProvider.delete(providerId);
			this._log.trace(`[ForgeLanguageModelBridge] Tore down models for provider: ${providerId}`);
		}
	}

	/** Serialized, coalesced entry point for `_syncProvider`. */
	private _syncProvider(providerName: ProviderName): void {
		const previous = this._syncChainByProvider.get(providerName) ?? Promise.resolve();
		const chain = previous
			.then(() => this._doSyncProvider(providerName))
			.catch(err => this._log.warn(`[ForgeLanguageModelBridge] _syncProvider(${providerName}) failed:`, err))
			.then(() => {
				if (this._syncChainByProvider.get(providerName) === chain) {
					this._syncChainByProvider.delete(providerName);
				}
			});
		this._syncChainByProvider.set(providerName, chain);
	}

	private async _doSyncProvider(providerName: ProviderName): Promise<void> {
		const { models } = await this._providerRegistryService.listModelsFor(providerName);
		const signature = models.map(m => m.id).join('\u0000');
		if (models.length === 0) {
			// zero models on a *healthy* probe still tears the provider down;
			// if the server can't be reached, health will be unhealthy instead
			this._modelSignatureByProvider.delete(providerName);
			this._teardownProvider(providerName);
			return;
		}
		if (this._modelSignatureByProvider.get(providerName) === signature && this._registrationsByProvider.has(providerName)) {
			// nothing changed — avoid tearing down and re-registering every model
			return;
		}

		// Tear down old registrations first (model list may have changed).
		this._teardownProvider(providerName);

		const store = new DisposableStore();
		this._registrationsByProvider.set(providerName, store);
		const registeredIds = new Set<string>();
		this._registeredIdsByProvider.set(providerName, registeredIds);

		for (const model of models) {
			const identifier = safeModelId(providerName, model.id, registeredIds);

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
				if (!store.isDisposed) {
					store.add(reg);
					registeredIds.add(identifier);
					this._log.trace(`[ForgeLanguageModelBridge] Registered model: ${identifier}`);
				} else {
					// a teardown raced our registration — dispose it immediately
					reg.dispose();
				}
			} catch (err) {
				this._log.warn(`[ForgeLanguageModelBridge] Failed to register model ${identifier}:`, err);
			}
		}

		this._modelSignatureByProvider.set(providerName, signature);
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
