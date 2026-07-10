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

	override capabilitiesFor(modelId: string): ModelCapabilities {
		return OLLAMA_CAPABILITIES[modelId] ?? super.capabilitiesFor(modelId);
	}

	protected override async _probeModels(token: CancellationToken) {
		const ep = this.endpoint();
		const res = await localFetch(`${ep}/api/tags`, { token, timeoutMs: 2_000 });
		const json: { models?: { name: string }[] } = await res.json();
		return (json.models ?? []).map(m => ({ id: m.name, raw: m }));
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
