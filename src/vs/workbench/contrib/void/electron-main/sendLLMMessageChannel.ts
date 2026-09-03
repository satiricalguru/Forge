/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// registered in app.ts
// code convention is to make a service responsible for this stuff, and not a channel, but having fewer files is simpler...

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { EventLLMMessageOnTextParams, EventLLMMessageOnErrorParams, EventLLMMessageOnFinalMessageParams, MainSendLLMMessageParams, AbortRef, SendLLMMessageParams, MainLLMMessageAbortParams, ModelListParams, EventModelListOnSuccessParams, EventModelListOnErrorParams, OllamaModelResponse, OpenaiCompatibleModelResponse, MainModelListParams, MainPullModelParams, EventPullModelOnProgressParams, EventPullModelOnSuccessParams, EventPullModelOnErrorParams } from '../common/sendLLMMessageTypes.js';
import { sendLLMMessage } from './llmMessage/sendLLMMessage.js'
import { sendLLMMessageToProviderImplementation } from './llmMessage/sendLLMMessage.impl.js';
import { assertLocalUrl, localFetch } from '../common/forge/httpUtil.js';

// NODE IMPLEMENTATION - calls actual sendLLMMessage() and returns listeners to it

export class LLMMessageChannel implements IServerChannel {

	// sendLLMMessage
	private readonly llmMessageEmitters = {
		onText: new Emitter<EventLLMMessageOnTextParams>(),
		onFinalMessage: new Emitter<EventLLMMessageOnFinalMessageParams>(),
		onError: new Emitter<EventLLMMessageOnErrorParams>(),
	}

	// aborters for above
	private readonly _infoOfRunningRequest: Record<string, { waitForSend: Promise<void> | undefined, abortRef: AbortRef }> = {}


	// list
	private readonly listEmitters = {
		ollama: {
			success: new Emitter<EventModelListOnSuccessParams<OllamaModelResponse>>(),
			error: new Emitter<EventModelListOnErrorParams<OllamaModelResponse>>(),
		},
		openaiCompat: {
			success: new Emitter<EventModelListOnSuccessParams<OpenaiCompatibleModelResponse>>(),
			error: new Emitter<EventModelListOnErrorParams<OpenaiCompatibleModelResponse>>(),
		},
	} satisfies {
		[providerName in 'ollama' | 'openaiCompat']: {
			success: Emitter<EventModelListOnSuccessParams<any>>,
			error: Emitter<EventModelListOnErrorParams<any>>,
		}
	}

	// pull
	private readonly pullEmitters = {
		onProgress: new Emitter<EventPullModelOnProgressParams>(),
		onSuccess: new Emitter<EventPullModelOnSuccessParams>(),
		onError: new Emitter<EventPullModelOnErrorParams>(),
	}

	// stupidly, channels can't take in @IService
	constructor() { }

	// browser uses this to listen for changes
	listen(_: unknown, event: string): Event<any> {
		// text
		if (event === 'onText_sendLLMMessage') return this.llmMessageEmitters.onText.event;
		else if (event === 'onFinalMessage_sendLLMMessage') return this.llmMessageEmitters.onFinalMessage.event;
		else if (event === 'onError_sendLLMMessage') return this.llmMessageEmitters.onError.event;
		// list
		else if (event === 'onSuccess_list_ollama') return this.listEmitters.ollama.success.event;
		else if (event === 'onError_list_ollama') return this.listEmitters.ollama.error.event;
		else if (event === 'onSuccess_list_openAICompatible') return this.listEmitters.openaiCompat.success.event;
		else if (event === 'onError_list_openAICompatible') return this.listEmitters.openaiCompat.error.event;
		// pull
		else if (event === 'onProgress_pull_ollama') return this.pullEmitters.onProgress.event;
		else if (event === 'onSuccess_pull_ollama') return this.pullEmitters.onSuccess.event;
		else if (event === 'onError_pull_ollama') return this.pullEmitters.onError.event;

		else throw new Error(`Event not found: ${event}`);
	}

	// browser uses this to call (see this.channel.call() in llmMessageService.ts for all usages)
	async call(_: unknown, command: string, params: any): Promise<any> {
		if (command === 'sendLLMMessage') {
			if (!params || typeof params.requestId !== 'string') throw new Error('sendLLMMessage: missing requestId');
			this._callSendLLMMessage(params)
		}
		else if (command === 'abort') {
			await this._callAbort(params)
		}
		else if (command === 'ollamaList') {
			this._callOllamaList(params)
		}
		else if (command === 'openAICompatibleList') {
			this._callOpenAICompatibleList(params)
		}
		else if (command === 'pullOllamaModel') {
			this._callPullOllamaModel(params)
		}
		else {
			throw new Error(`Void sendLLM: command "${command}" not recognized.`)
		}
	}

	// the only place sendLLMMessage is actually called
	private _callSendLLMMessage(params: MainSendLLMMessageParams) {
		const { requestId } = params;

		if (!(requestId in this._infoOfRunningRequest))
			this._infoOfRunningRequest[requestId] = { waitForSend: undefined, abortRef: { current: null } }

		const mainThreadParams: SendLLMMessageParams = {
			...params,
			onText: (p) => {
				this.llmMessageEmitters.onText.fire({ requestId, ...p });
			},
			onFinalMessage: (p) => {
				this.llmMessageEmitters.onFinalMessage.fire({ requestId, ...p });
				delete this._infoOfRunningRequest[requestId];
			},
			onError: (p) => {
				console.log('sendLLM: firing err');
				this.llmMessageEmitters.onError.fire({ requestId, ...p });
				delete this._infoOfRunningRequest[requestId];
			},
			abortRef: this._infoOfRunningRequest[requestId].abortRef,
		}
		const p = sendLLMMessage(mainThreadParams);
		this._infoOfRunningRequest[requestId].waitForSend = p
		p.finally(() => {
			// safety net: if neither onFinalMessage nor onError fired (e.g. an
			// unexpected early return), make sure the entry doesn't leak
			delete this._infoOfRunningRequest[requestId];
		});
	}

	private async _callAbort(params: MainLLMMessageAbortParams) {
		const { requestId } = params;
		if (typeof requestId !== 'string') return;
		const running = this._infoOfRunningRequest[requestId]
		if (!running) return
		// abortRef.current is set synchronously by sendLLMMessage() before it
		// hits its first await, so we can abort immediately — never wait for the
		// send promise (it only resolves once the stream finishes; waiting would
		// deadlock the abort until the generation completes).
		running.abortRef?.current?.()
		delete this._infoOfRunningRequest[requestId]
	}





	_callOllamaList = (params: MainModelListParams<OllamaModelResponse>) => {
		const { requestId } = params
		const emitters = this.listEmitters.ollama
		const mainThreadParams: ModelListParams<OllamaModelResponse> = {
			...params,
			onSuccess: (p) => { emitters.success.fire({ requestId, ...p }); },
			onError: (p) => { emitters.error.fire({ requestId, ...p }); },
		}
		sendLLMMessageToProviderImplementation.ollama.list(mainThreadParams)
	}

	_callOpenAICompatibleList = (params: MainModelListParams<OpenaiCompatibleModelResponse>) => {
		const { requestId, providerName } = params
		const emitters = this.listEmitters.openaiCompat
		const mainThreadParams: ModelListParams<OpenaiCompatibleModelResponse> = {
			...params,
			onSuccess: (p) => { emitters.success.fire({ requestId, ...p }); },
			onError: (p) => { emitters.error.fire({ requestId, ...p }); },
		}
		sendLLMMessageToProviderImplementation[providerName].list(mainThreadParams)
	}

	private async _callPullOllamaModel(params: MainPullModelParams) {
		const { modelName, endpoint, requestId } = params;
		if (typeof modelName !== 'string' || typeof endpoint !== 'string' || typeof requestId !== 'string') {
			this.pullEmitters.onError.fire({ requestId: typeof requestId === 'string' ? requestId : '', error: 'Invalid pull request params' });
			return;
		}
		if (!modelName.trim() || modelName.length > 256) {
			this.pullEmitters.onError.fire({ requestId, error: 'Invalid model name' });
			return;
		}
		try {
			assertLocalUrl(endpoint);
		} catch (err) {
			this.pullEmitters.onError.fire({ requestId, error: err instanceof Error ? err.message : String(err) });
			return;
		}
		let reader: { read(): Promise<{ value: Uint8Array | undefined; done: boolean }>; cancel(reason?: unknown): Promise<void>; releaseLock(): void } | undefined;
		try {
			const normalizedEndpoint = endpoint.replace(/\/+$/, '');
			const pullAbort = AbortSignal.timeout(30 * 60_000);
			const res = await localFetch(`${normalizedEndpoint}/api/pull`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: modelName, stream: true }),
				timeoutMs: 10_000,
				signal: pullAbort,
			});

			reader = res.body?.getReader();
			if (!reader) {
				this.pullEmitters.onError.fire({ requestId, error: 'ReadableStream not supported' });
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				if (buffer.length > 8 * 1024 * 1024) {
					// cap runaway progress output
					this.pullEmitters.onError.fire({ requestId, error: 'Pull progress output exceeded the maximum allowed size' });
					try { await reader.cancel('buffer overflow'); } catch { /* ignore */ }
					return;
				}
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;

					try {
						const json = JSON.parse(trimmed);
						if (json.error) {
							this.pullEmitters.onError.fire({ requestId, error: json.error });
							try { await reader.cancel('server error'); } catch { /* ignore */ }
							return;
						}
						let percent = 0;
						if (json.total && json.completed) {
							percent = Math.round((json.completed / json.total) * 100);
						}
						const status = json.status || 'pulling';
						this.pullEmitters.onProgress.fire({ requestId, percent, status });
					} catch (e) {
						// ignore parse errors on partial chunks
					}
				}
			}

			this.pullEmitters.onSuccess.fire({ requestId });
		} catch (error) {
			this.pullEmitters.onError.fire({ requestId, error: String(error) });
		} finally {
			try { reader?.releaseLock(); } catch { /* ignore */ }
		}
	}

}
