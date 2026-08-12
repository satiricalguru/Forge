/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { BaseHttpProvider } from './baseProvider.js';
import { ChatMessage, ChatRequest, ChatStreamHandle, FIMRequest, ModelCapabilities, StreamChunk, ToolSpec } from '../forgeProviderTypes.js';
import { localFetch, streamSSE } from './httpUtil.js';


const OLLAMA_CAPABILITIES: Record<string, ModelCapabilities> = {
	'llama3.1:8b':      { supportsTools: true,  supportsFIM: false, supportsReasoning: false, supportsVision: false, supportsSystemMessage: true,  contextWindow: 128_000, reservedOutputTokens: 4096 },
	'llama3.1:70b':     { supportsTools: true,  supportsFIM: false, supportsReasoning: false, supportsVision: false, supportsSystemMessage: true,  contextWindow: 128_000, reservedOutputTokens: 4096 },
	'llama3.2:3b':      { supportsTools: true,  supportsFIM: false, supportsReasoning: false, supportsVision: false, supportsSystemMessage: true,  contextWindow: 128_000, reservedOutputTokens: 4096 },
	'qwen2.5:7b':       { supportsTools: true,  supportsFIM: false, supportsReasoning: false, supportsVision: false, supportsSystemMessage: true,  contextWindow: 32_000,  reservedOutputTokens: 4096 },
	'qwen2.5-coder:7b': { supportsTools: true,  supportsFIM: true,  supportsReasoning: false, supportsVision: false, supportsSystemMessage: true,  contextWindow: 32_000,  reservedOutputTokens: 4096 },
	'qwen3:8b':         { supportsTools: true,  supportsFIM: false, supportsReasoning: true,  supportsVision: false, supportsSystemMessage: true,  contextWindow: 128_000, reservedOutputTokens: 4096 },
	'deepseek-r1:8b':   { supportsTools: true,  supportsFIM: false, supportsReasoning: true,  supportsVision: false, supportsSystemMessage: true,  contextWindow: 64_000,  reservedOutputTokens: 4096 },
	'gemma3:4b':        { supportsTools: false, supportsFIM: false, supportsReasoning: false, supportsVision: true,  supportsSystemMessage: true,  contextWindow: 128_000, reservedOutputTokens: 4096 },
	'mistral:7b':       { supportsTools: true,  supportsFIM: false, supportsReasoning: false, supportsVision: false, supportsSystemMessage: true,  contextWindow: 32_000,  reservedOutputTokens: 4096 },
	'codellama:7b':     { supportsTools: false, supportsFIM: true,  supportsReasoning: false, supportsVision: false, supportsSystemMessage: true,  contextWindow: 16_000,  reservedOutputTokens: 4096 },
	'codestral:22b':    { supportsTools: true,  supportsFIM: true,  supportsReasoning: false, supportsVision: false, supportsSystemMessage: true,  contextWindow: 32_000,  reservedOutputTokens: 4096 },
};


export class OllamaProvider extends BaseHttpProvider {

	readonly id = 'ollama';
	readonly displayName = 'Ollama';
	readonly defaultEndpoint = 'http://127.0.0.1:11434';

	// keyed by `${endpoint}::${modelId}` so endpoint changes never collide
	private static readonly _probedModelsMap = new Map<string, any>();
	private static readonly MAX_CACHED_MODELS = 256;

	override capabilitiesFor(modelId: string): ModelCapabilities {
		const cacheKey = `${this.endpoint()}::${modelId}`;
		const cached = OllamaProvider._probedModelsMap.get(cacheKey);
		if (cached) {
			const details = cached.details;
			const caps = cached.capabilities || [];
			const supportsTools = caps.includes('tools');
			const families = details?.families || [];
			const isVision = caps.includes('vision') || families.includes('mllm') || families.includes('clip') || modelId.toLowerCase().includes('vision');
			const supportsReasoning = caps.includes('thinking') || modelId.toLowerCase().includes('r1');
			
			let ctxLen = cached.context_length ?? details?.context_length;
			if (!ctxLen && cached.model_info && typeof cached.model_info === 'object') {
				for (const k of Object.keys(cached.model_info)) {
					if (k.endsWith('.context_length') || k === 'context_length') {
						const val = Number(cached.model_info[k]);
						if (!isNaN(val) && val > 0) { ctxLen = val; break; }
					}
				}
			}
			if (!ctxLen && cached.parameters && typeof cached.parameters === 'string') {
				const match = cached.parameters.match(/num_ctx\s+(\d+)/);
				if (match) {
					const val = parseInt(match[1], 10);
					if (!isNaN(val) && val > 0) ctxLen = val;
				}
			}

			return {
				supportsTools,
				supportsFIM: OLLAMA_CAPABILITIES[modelId]?.supportsFIM ?? false,
				supportsReasoning,
				supportsVision: isVision,
				supportsSystemMessage: true,
				contextWindow: ctxLen ?? OLLAMA_CAPABILITIES[modelId]?.contextWindow ?? 4096,
				reservedOutputTokens: 4096
			};
		}
		return OLLAMA_CAPABILITIES[modelId] ?? super.capabilitiesFor(modelId);
	}

	protected override async _probeModels(token: CancellationToken) {
		const ep = this.endpoint();
		const res = await localFetch(`${ep}/api/tags`, { token, timeoutMs: 2_000 });
		const json: { models?: any[] } = await res.json();
		const models = json.models ?? [];
		const detailedModels = await Promise.all(models.map(async (m) => {
			try {
				const showRes = await localFetch(`${ep}/api/show`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: m.name }),
					token,
					timeoutMs: 1_500
				});
				const showJson = await showRes.json();
				let ctxLen: number | undefined;
				if (showJson.model_info && typeof showJson.model_info === 'object') {
					for (const k of Object.keys(showJson.model_info)) {
						if (k.endsWith('.context_length') || k === 'context_length') {
							const val = Number(showJson.model_info[k]);
							if (!isNaN(val) && val > 0) { ctxLen = val; break; }
						}
					}
				}
				if (!ctxLen && showJson.parameters) {
					const match = String(showJson.parameters).match(/num_ctx\s+(\d+)/);
					if (match) {
						const val = parseInt(match[1], 10);
						if (!isNaN(val) && val > 0) ctxLen = val;
					}
				}
				const mergedRaw = {
					...m,
					...showJson,
					details: { ...m.details, ...showJson.details, ...(ctxLen ? { context_length: ctxLen } : {}) },
					context_length: ctxLen
				};
				this._cacheModel(ep, m.name, mergedRaw);
				return { id: m.name, raw: mergedRaw };
			} catch {
				this._cacheModel(ep, m.name, m);
				return { id: m.name, raw: m };
			}
		}));
		return detailedModels;
	}

	private _cacheModel(endpoint: string, modelId: string, raw: any): void {
		const cacheKey = `${endpoint}::${modelId}`;
		OllamaProvider._probedModelsMap.set(cacheKey, raw);
		if (OllamaProvider._probedModelsMap.size > OllamaProvider.MAX_CACHED_MODELS) {
			// drop the oldest entries (Map preserves insertion order)
			for (const key of OllamaProvider._probedModelsMap.keys()) {
				if (OllamaProvider._probedModelsMap.size <= OllamaProvider.MAX_CACHED_MODELS) break;
				OllamaProvider._probedModelsMap.delete(key);
			}
		}
	}

	override async streamChat(req: ChatRequest, onChunk: (c: StreamChunk) => void): Promise<ChatStreamHandle> {
		const ep = this.endpoint();
		const body = {
			model: req.model,
			messages: req.messages.map(normalizeMessage),
			stream: true,
			...(req.tools ? { tools: req.tools.map(normalizeTool) } : {}),
		};
		const handle = await streamSSE(`${ep}/api/chat`, body, req.signal, (obj) => {
			const o = obj as { message?: { content?: string; tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[] }; done?: boolean; done_reason?: string };
			if (o.message?.content) onChunk({ kind: 'text', text: o.message.content });
			if (o.message?.tool_calls) {
				for (const tc of o.message.tool_calls) {
					onChunk({ kind: 'tool_call', id: tc.id, name: tc.function?.name, argumentsDelta: tc.function?.arguments === undefined ? undefined : (typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments)) });
				}
			}
			if (o.done) onChunk({ kind: 'done', finishReason: o.done_reason });
		});
		return { cancel: handle.cancel, finished: handle.finished };
	}

	override async streamFIM(req: FIMRequest, onChunk: (c: StreamChunk) => void): Promise<ChatStreamHandle> {
		const ep = this.endpoint();
		const body = {
			model: req.model,
			prompt: req.prefix,
			suffix: req.suffix,
			stream: true,
			raw: true,
			options: { stop: req.stopTokens ?? [], num_predict: req.maxTokens ?? 300 },
		};
		const handle = await streamSSE(`${ep}/api/generate`, body, req.signal, (obj) => {
			const o = obj as { response?: string; done?: boolean; done_reason?: string };
			if (o.response) onChunk({ kind: 'text', text: o.response });
			if (o.done) onChunk({ kind: 'done', finishReason: o.done_reason });
		});
		return { cancel: handle.cancel, finished: handle.finished };
	}
}


function normalizeMessage(m: ChatMessage): Record<string, unknown> {
	if (m.role === 'tool') return { role: 'tool', content: m.content };
	if (m.role === 'assistant' && m.tool_calls) return { role: 'assistant', content: m.content, tool_calls: m.tool_calls };
	return { role: m.role, content: m.content };
}


function normalizeTool(t: ToolSpec) {
	return { type: 'function', function: { name: t.name, description: t.description, parameters: { type: 'object', properties: t.parameters } } };
}
