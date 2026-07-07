/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { BaseHttpProvider } from './baseProvider.js';
import { ChatRequest, ChatStreamHandle, FIMRequest, StreamChunk } from '../forgeProviderTypes.js';
import { localFetch, streamSSE } from './httpUtil.js';


export class LMStudioProvider extends BaseHttpProvider {

	readonly id = 'lmstudio';
	readonly displayName = 'LM Studio';
	readonly defaultEndpoint = 'http://localhost:1234';

	protected override async _probeModels(token: CancellationToken) {
		const ep = this.endpoint();
		const res = await localFetch(`${ep}/v1/models`, { signal: tokenToSignal(token), timeoutMs: 2_000 });
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

		const handle = await streamSSE(
			`${ep}/v1/chat/completions`,
			body,
			req.signal,
			(obj) => {
				const o = obj as { choices?: { delta?: { content?: string; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
				const delta = o.choices?.[0]?.delta;
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


function tokenToSignal(token: CancellationToken): AbortSignal {
	const controller = new AbortController();
	if (token.isCancellationRequested) controller.abort();
	token.onCancellationRequested(() => controller.abort());
	return controller.signal;
}
