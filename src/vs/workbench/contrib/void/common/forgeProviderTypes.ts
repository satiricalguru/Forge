/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

// ----- Streaming chat (shared by all local providers) -----

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool' | 'developer';

export type ChatMessage =
	| { role: 'system' | 'user' | 'developer'; content: string }
	| {
		role: 'assistant';
		content: string;
		tool_calls?: { id: string; name: string; arguments: string }[];
	}
	| { role: 'tool'; content: string; tool_call_id: string };

export type ToolSpec = {
	name: string;
	description: string;
	parameters: { [k: string]: { type: 'string'; description: string } };
};

export type ChatRequest = {
	model: string;
	messages: ChatMessage[];
	tools?: ToolSpec[] | null;
	signal?: AbortSignal;
	// pass-through for adapters
	extras?: { [k: string]: unknown };
};

export type StreamChunk =
	| { kind: 'text'; text: string }
	| { kind: 'reasoning'; text: string }
	| {
		kind: 'tool_call';
		id?: string;
		name?: string;
		argumentsDelta?: string;
	}
	| { kind: 'done'; finishReason?: string }
	| { kind: 'error'; message: string };

export type ChatStreamHandle = {
	cancel(): void;
	/** Resolves when the response stream has finished (or been aborted). */
	finished: Promise<void>;
};

// ----- FIM (fill-in-middle) for tab autocomplete -----

export type FIMRequest = {
	model: string;
	prefix: string;
	suffix: string;
	stopTokens?: string[];
	maxTokens?: number;
	signal?: AbortSignal;
};

// ----- Model list (for auto-discovery) -----

export type DiscoveredModel = {
	id: string;
	// raw provider payload, useful for capabilities lookup
	raw?: unknown;
};

export type ModelList = {
	models: DiscoveredModel[];
};

// ----- Capabilities -----

export type ModelCapabilities = {
	supportsTools: boolean;
	supportsFIM: boolean;
	supportsReasoning: boolean;
	supportsVision: boolean;
	supportsSystemMessage: boolean;
	// token-aware params
	contextWindow: number | null;
	reservedOutputTokens: number | null;
};

export const UNKNOWN_CAPABILITIES: ModelCapabilities = {
	supportsTools: false,
	supportsFIM: false,
	supportsReasoning: false,
	supportsVision: false,
	supportsSystemMessage: true,
	contextWindow: null,
	reservedOutputTokens: null,
};

// ----- Health -----

export type ProviderHealth =
	| { status: 'unknown' }
	| { status: 'checking' }
	| { status: 'healthy'; latencyMs: number; models: number }
	| { status: 'unhealthy'; error: string; latencyMs: number };

// ----- The core abstraction every local runtime must implement -----

export interface ILocalProvider {
	readonly id: string;                 // e.g. 'ollama'
	readonly displayName: string;        // e.g. 'Ollama'
	readonly defaultEndpoint: string;    // e.g. 'http://127.0.0.1:11434'
	readonly isAutoDiscoverable: boolean;

	// Resolve the base URL (allowing user override)
	resolveEndpoint(userOverride: string | undefined): string;

	// Health probe — must NOT throw, must resolve quickly
	healthcheck(token: CancellationToken): Promise<ProviderHealth>;

	// List installed models
	listModels(token: CancellationToken): Promise<ModelList>;

	// Streaming chat
	streamChat(req: ChatRequest, onChunk: (c: StreamChunk) => void): Promise<ChatStreamHandle>;

	// FIM (optional)
	streamFIM?(req: FIMRequest, onChunk: (c: StreamChunk) => void): Promise<ChatStreamHandle>;

	// Capabilities lookup for a given model (best-effort, may use a static table)
	capabilitiesFor(modelId: string): ModelCapabilities;
}

// ----- Registry -----

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface ILocalProviderRegistry {
	readonly _serviceBrand: undefined;
	readonly providers: ReadonlyMap<string, ILocalProvider>;
	get(id: string): ILocalProvider | undefined;
	all(): ILocalProvider[];
	autoDiscoverable(): ILocalProvider[];
	register(provider: ILocalProvider): { dispose(): void };
}

export const ILocalProviderRegistry = createDecorator<ILocalProviderRegistry>('localProviderRegistry');

// ----- Events -----

export interface ILocalProviderRegistryService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeHealth: Event<{ providerId: string; health: ProviderHealth }>;
	getHealth(providerId: string): ProviderHealth;
	getAllHealth(): ReadonlyMap<string, ProviderHealth>;
	forceCheck(providerId: string): Promise<ProviderHealth>;
	startAutoDiscovery(): void;
	endpointFor(providerName: import('./voidSettingsTypes.js').ProviderName): string;
	listModelsFor(providerName: import('./voidSettingsTypes.js').ProviderName, token?: CancellationToken): Promise<ModelList>;
	capabilitiesFor(providerName: import('./voidSettingsTypes.js').ProviderName, modelName: string): ModelCapabilities;
	providerFor(providerName: import('./voidSettingsTypes.js').ProviderName): ILocalProvider | undefined;
}

export const ILocalProviderRegistryService = createDecorator<ILocalProviderRegistryService>('localProviderRegistryService');
