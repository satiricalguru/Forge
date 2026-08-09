/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { BaseHttpProvider } from './baseProvider.js';
import { ChatRequest, ChatStreamHandle, FIMRequest, ModelCapabilities, StreamChunk } from '../forgeProviderTypes.js';
import { localFetch, streamSSE } from './httpUtil.js';


export class LMStudioProvider extends BaseHttpProvider {

	readonly id = 'lmstudio';
	readonly displayName = 'LM Studio';
	readonly defaultEndpoint = 'http://localhost:1234';

	private static readonly _probedModelsMap = new Map<string, any>();
	private static readonly MAX_CACHED_MODELS = 256;

	override capabilitiesFor(modelId: string): ModelCapabilities {
		const cacheKey = `${this.endpoint()}::${modelId}`;
		const cached = LMStudioProvider._probedModelsMap.get(cacheKey);
		if (cached) {
			const supportsTools = cached.capabilities?.includes('tool_use') ?? false;
			const isVision = cached.type === 'vlm' || modelId.toLowerCase().includes('vision');
			const supportsReasoning = modelId.toLowerCase().includes('r1') || modelId.toLowerCase().includes('reasoning');
			const contextLength = cached.loaded_context_length ?? cached.max_context_length ?? 4096;

			return {
				supportsTools,
				supportsFIM: true,
				supportsReasoning,
				supportsVision: isVision,
				supportsSystemMessage: true,
				contextWindow: contextLength,
				reservedOutputTokens: 4096
			};
		}
		return super.capabilitiesFor(modelId);
	}

	protected override async _probeModels(token: CancellationToken) {
		const ep = this.endpoint();
		try {
			const res = await localFetch(`${ep}/api/v0/models`, { token, timeoutMs: 2_000 });
			const json: { data?: any[] } = await res.json();
			const data = json.data ?? [];
			for (const m of data) {
				this._cacheModel(ep, m.id, m);
			}
			return data.map(m => ({ id: m.id, raw: m }));
		} catch (e) {
			// Fallback to /v1/models if /api/v0/models fails
			try {
				const res = await localFetch(`${ep}/v1/models`, { token, timeoutMs: 2_000 });
				const json: { data?: { id: string }[] } = await res.json();
				const data = json.data ?? [];
				for (const m of data) {
					this._cacheModel(ep, m.id, m);
				}
				return data.map(m => ({ id: m.id, raw: m }));
			} catch (fallbackErr) {
				return [];
			}
		}
	}

	private _cacheModel(endpoint: string, modelId: string, raw: any): void {
		const cacheKey = `${endpoint}::${modelId}`;
		LMStudioProvider._probedModelsMap.set(cacheKey, raw);
		if (LMStudioProvider._probedModelsMap.size > LMStudioProvider.MAX_CACHED_MODELS) {
			// drop the oldest entries (Map preserves insertion order)
			for (const key of LMStudioProvider._probedModelsMap.keys()) {
				if (LMStudioProvider._probedModelsMap.size <= LMStudioProvider.MAX_CACHED_MODELS) break;
				LMStudioProvider._probedModelsMap.delete(key);
			}
		}
	}

	override async streamChat(req: ChatRequest, onChunk: (c: StreamChunk) => void): Promise<ChatStreamHandle> {
		const ep = this.endpoint();
		const body: Record<string, unknown> = {
			model: req.model,
			messages: req.messages,
			stream: true,
		};
		if (req.tools) body.tools = req.tools;

		const handle = await streamSSE(
			`${ep}/v1/chat/completions`,
			body,
			req.signal,
			(obj) => {
				const o = obj as { choices?: { delta?: { content?: string; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[]; reasoning_content?: string; reasoning?: string } }[] };
				const delta = o.choices?.[0]?.delta;
				if (delta?.reasoning_content) onChunk({ kind: 'reasoning', text: delta.reasoning_content });
				else if (delta?.reasoning) onChunk({ kind: 'reasoning', text: delta.reasoning });
				if (delta?.content) onChunk({ kind: 'text', text: delta.content });
				if (delta?.tool_calls) {
					for (const tc of delta.tool_calls) {
						onChunk({ kind: 'tool_call', id: tc.id, name: tc.function?.name, argumentsDelta: tc.function?.arguments });
					}
				}
			},
			{ 'Authorization': 'Bearer lm-studio' },
		);
		return { cancel: handle.cancel, finished: handle.finished };
	}

	override async streamFIM(req: FIMRequest, onChunk: (c: StreamChunk) => void): Promise<ChatStreamHandle> {
		const ep = this.endpoint();
		const body = {
			model: req.model,
			prompt: req.prefix,
			suffix: req.suffix,
			stream: true,
			max_tokens: req.maxTokens ?? 300,
			stop: req.stopTokens,
		};
		const handle = await streamSSE(`${ep}/v1/completions`, body, req.signal, (obj) => {
			const o = obj as { choices?: { text?: string }[] };
			const text = o.choices?.[0]?.text;
			if (text) onChunk({ kind: 'text', text });
		});
		return { cancel: handle.cancel, finished: handle.finished };
	}
}
