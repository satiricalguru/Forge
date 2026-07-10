/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { BaseHttpProvider } from './baseProvider.js';
import { ChatRequest, ChatStreamHandle, FIMRequest, StreamChunk } from '../forgeProviderTypes.js';
import { localFetch, streamSSE } from './httpUtil.js';


type Spec = {
	id: string;
	displayName: string;
	defaultEndpoint: string;
	healthPath?: string;
	chatPath?: string;
	fimPath?: string | null;
	apiKey?: string;
};


export class OpenAICompatibleProvider extends BaseHttpProvider {

	readonly id: string;
	readonly displayName: string;
	readonly defaultEndpoint: string;
	private readonly healthPath: string;
	private readonly chatPath: string;
	private readonly fimPath: string | null;
	private readonly apiKey: string;
	/** Optional extra headers from user settings (openAICompatible provider). */
	customHeaders: Record<string, string> = {};

	constructor(spec: Spec) {
		super();
		this.id = spec.id;
		this.displayName = spec.displayName;
		this.defaultEndpoint = spec.defaultEndpoint;
		this.healthPath = spec.healthPath ?? '/v1/models';
		this.chatPath = spec.chatPath ?? '/v1/chat/completions';
		this.fimPath = spec.fimPath ?? '/v1/completions';
		this.apiKey = spec.apiKey ?? 'noop';
	}

	override resolveEndpoint(userOverride: string | undefined): string {
		const base = super.resolveEndpoint(userOverride);
		return base.replace(/\/v1\/?$/, '');
	}

	private _url(base: string, path: string): string {
		const sep = path.startsWith('/') ? '' : '/';
		return `${base}/v1${path.startsWith('/') ? path : sep + path}`;
	}

	protected override async _probeModels(token: CancellationToken) {
		const ep = this.endpoint();
		const url = this._url(ep, this.healthPath);
		const res = await localFetch(url, { token, timeoutMs: 2_000 });
		const json: { data?: { id: string }[] } = await res.json();
		return (json.data ?? []).map(m => ({ id: m.id, raw: m }));
	}

	override async streamChat(req: ChatRequest, onChunk: (c: StreamChunk) => void): Promise<ChatStreamHandle> {
		const ep = this.endpoint();
		const body: Record<string, unknown> = {
			model: req.model,
			messages: req.messages,
			stream: true,
		};
		if (req.tools) body.tools = req.tools;
		const headers: Record<string, string> = { 'Authorization': `Bearer ${this.apiKey}`, ...this.customHeaders };
		const handle = await streamSSE(this._url(ep, this.chatPath), body, req.signal, (obj) => {
			const o = obj as { choices?: { delta?: { content?: string; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
			const delta = o.choices?.[0]?.delta;
			if (delta?.content) onChunk({ kind: 'text', text: delta.content });
			if (delta?.tool_calls) {
				for (const tc of delta.tool_calls) {
					onChunk({ kind: 'tool_call', id: tc.id, name: tc.function?.name, argumentsDelta: tc.function?.arguments });
				}
			}
		}, headers);
		return { cancel: handle.cancel, finished: handle.finished };
	}

	override async streamFIM(req: FIMRequest, onChunk: (c: StreamChunk) => void): Promise<ChatStreamHandle> {
		if (!this.fimPath) throw new Error(`${this.displayName} does not support FIM.`);
		const ep = this.endpoint();
		const body = {
			model: req.model,
			prompt: req.prefix,
			suffix: req.suffix,
			stream: true,
			max_tokens: req.maxTokens ?? 300,
			stop: req.stopTokens,
		};
		const headers = { 'Authorization': `Bearer ${this.apiKey}`, ...this.customHeaders };
		const handle = await streamSSE(this._url(ep, this.fimPath), body, req.signal, (obj) => {
			const o = obj as { choices?: { text?: string }[] };
			const text = o.choices?.[0]?.text;
			if (text) onChunk({ kind: 'text', text });
		}, headers);
		return { cancel: handle.cancel, finished: handle.finished };
	}
}


export const vLLMProvider = new OpenAICompatibleProvider({
	id: 'vllm',
	displayName: 'vLLM',
	defaultEndpoint: 'http://localhost:8000',
	healthPath: '/models',
	chatPath: '/chat/completions',
	fimPath: null,
});

export const LlamaCppProvider = new OpenAICompatibleProvider({
	id: 'llamacpp',
	displayName: 'llama.cpp',
	defaultEndpoint: 'http://localhost:8080',
	healthPath: '/v1/models',
	chatPath: '/v1/chat/completions',
	fimPath: '/v1/completions',
});


export const LocalAIProvider = new OpenAICompatibleProvider({
	id: 'localai',
	displayName: 'LocalAI',
	defaultEndpoint: 'http://localhost:8080',
	healthPath: '/v1/models',
	chatPath: '/v1/chat/completions',
	fimPath: '/v1/completions',
});
