/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { resolveForgeProvider } from '../../common/forge/forgeProviderResolve.js';
import { ChatMessage, ToolSpec } from '../../common/forgeProviderTypes.js';
import { getSendableReasoningInfo, getModelCapabilities, getProviderCapabilities } from '../../common/modelCapabilities.js';
import { availableTools, InternalToolInfo } from '../../common/prompt/prompts.js';
import { LLMChatMessage, LLMFIMMessage, OllamaModelResponse, OnError, OnFinalMessage, OnText, RawToolCallObj, RawToolParamsObj } from '../../common/sendLLMMessageTypes.js';
import { ChatMode, ProviderName, SettingsOfProvider } from '../../common/voidSettingsTypes.js';
import { extractReasoningWrapper, extractXMLToolsWrapper } from './extractGrammar.js';


type SendChatParams = {
	messages: LLMChatMessage[];
	onText: OnText;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	settingsOfProvider: SettingsOfProvider;
	modelSelectionOptions: import('../../common/voidSettingsTypes.js').ModelSelectionOptions | undefined;
	overridesOfModel: import('../../common/voidSettingsTypes.js').OverridesOfModel | undefined;
	modelName: string;
	_setAborter: (aborter: () => void) => void;
	providerName: ProviderName;
	chatMode: ChatMode | null;
	mcpTools: InternalToolInfo[] | undefined;
};

type SendFIMParams = {
	messages: LLMFIMMessage;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	settingsOfProvider: SettingsOfProvider;
	modelSelectionOptions: import('../../common/voidSettingsTypes.js').ModelSelectionOptions | undefined;
	overridesOfModel: import('../../common/voidSettingsTypes.js').OverridesOfModel | undefined;
	modelName: string;
	_setAborter: (aborter: () => void) => void;
	providerName: ProviderName;
};

type ListParams = {
	providerName: ProviderName;
	settingsOfProvider: SettingsOfProvider;
	onSuccess: (params: { models: OllamaModelResponse[] | { id: string }[] }) => void;
	onError: (params: { error: string }) => void;
};


const toForgeTool = (toolInfo: InternalToolInfo): ToolSpec => {
	const { name, description, params } = toolInfo;
	const parameters: ToolSpec['parameters'] = {};
	for (const key in params) {
		parameters[key] = { type: 'string', description: params[key].description };
	}
	return { name, description, parameters };
};

const forgeTools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined): ToolSpec[] | null => {
	const allowedTools = availableTools(chatMode, mcpTools);
	if (!allowedTools || Object.keys(allowedTools).length === 0) return null;
	return Object.values(allowedTools).map(toForgeTool);
};

const rawToolCallObjOfParamsStr = (name: string, toolParamsStr: string, id: string): RawToolCallObj | null => {
	let input: unknown;
	if (!toolParamsStr || toolParamsStr.trim() === '') {
		input = {};
	} else {
		try { input = JSON.parse(toolParamsStr); }
		catch { return null; }
	}
	if (input === null || typeof input !== 'object') return null;
	const rawParams: RawToolParamsObj = input as RawToolParamsObj;
	return { id, name, rawParams, doneParams: Object.keys(rawParams), isDone: true };
};


export const forgeSendChat = async (params: SendChatParams): Promise<void> => {
	const {
		messages,
		onError,
		settingsOfProvider,
		modelSelectionOptions,
		overridesOfModel,
		modelName: modelName_,
		_setAborter,
		providerName,
		chatMode,
		mcpTools,
	} = params;

	let onText = params.onText;
	let onFinalMessage = params.onFinalMessage;

	const provider = resolveForgeProvider(providerName, settingsOfProvider);
	if (!provider) {
		onError({ message: `Forge provider "${providerName}" is not configured.`, fullError: null });
		return;
	}

	const {
		modelName,
		specialToolFormat,
		reasoningCapabilities,
	} = getModelCapabilities(providerName, modelName_, overridesOfModel);

	const { providerReasoningIOSettings } = getProviderCapabilities(providerName);
	const { canIOReasoning, openSourceThinkTags } = reasoningCapabilities || {};
	const reasoningInfo = getSendableReasoningInfo('Chat', providerName, modelName_, modelSelectionOptions, overridesOfModel);

	const potentialTools = forgeTools(chatMode, mcpTools);
	const nativeTools = potentialTools && specialToolFormat === 'openai-style' ? potentialTools : null;

	const { needsManualParse: needsManualReasoningParse } = providerReasoningIOSettings?.output ?? {};
	const manuallyParseReasoning = needsManualReasoningParse && canIOReasoning && openSourceThinkTags;
	if (manuallyParseReasoning) {
		const wrapped = extractReasoningWrapper(onText, onFinalMessage, openSourceThinkTags);
		onText = wrapped.newOnText;
		onFinalMessage = wrapped.newOnFinalMessage;
	}

	if (!specialToolFormat) {
		const wrapped = extractXMLToolsWrapper(onText, onFinalMessage, chatMode, mcpTools);
		onText = wrapped.newOnText;
		onFinalMessage = wrapped.newOnFinalMessage;
	}

	const abortController = new AbortController();
	_setAborter(() => abortController.abort());

	let fullReasoningSoFar = '';
	let fullTextSoFar = '';
	// tool calls are accumulated per id so a response with multiple parallel
	// tool calls doesn't concatenate names/args into garbage
	const toolCalls = new Map<string, { id: string; name: string; paramsStr: string }>();
	let streamError: string | null = null;

	const currentToolCall = () => toolCalls.values().next().value as { id: string; name: string; paramsStr: string } | undefined;

	try {
		const handle = await provider.streamChat({
			model: modelName,
			messages: messages as ChatMessage[],
			tools: nativeTools,
			signal: abortController.signal,
			extras: {
				...providerReasoningIOSettings?.input?.includeInPayload?.(reasoningInfo),
			},
		}, (chunk) => {
			if (chunk.kind === 'error') {
				streamError = chunk.message;
				return;
			}
			if (chunk.kind === 'text') {
				fullTextSoFar += chunk.text;
			}
			if (chunk.kind === 'reasoning') {
				fullReasoningSoFar += chunk.text;
			}
			if (chunk.kind === 'tool_call') {
				const key = chunk.id ?? '0';
				let acc = toolCalls.get(key);
				if (!acc) {
					acc = { id: key, name: '', paramsStr: '' };
					toolCalls.set(key, acc);
				}
				acc.name += chunk.name ?? '';
				acc.paramsStr += chunk.argumentsDelta ?? '';
			}
			const tc = currentToolCall();
			onText({
				fullText: fullTextSoFar,
				fullReasoning: fullReasoningSoFar,
				toolCall: !tc ? undefined : { name: tc.name, rawParams: {}, isDone: false, doneParams: [], id: tc.id },
			});
		});

		await handle.finished;

		if (streamError) {
			onError({ message: streamError, fullError: null });
			return;
		}

		if (!fullTextSoFar && !fullReasoningSoFar && toolCalls.size === 0) {
			onError({ message: 'Forge: Response from model was empty.', fullError: null });
			return;
		}

		// parse each accumulated tool call; surface a recoverable error if one
		// started but couldn't be parsed (e.g. truncated by max_tokens) instead
		// of silently delivering a mangled tool call / plain-text reply
		let toolCallObj = {};
		if (toolCalls.size > 0) {
			for (const tc of toolCalls.values()) {
				if (!tc.name) continue;
				const parsed = rawToolCallObjOfParamsStr(tc.name, tc.paramsStr, tc.id);
				if (parsed) {
					toolCallObj = { toolCall: parsed };
					break;
				}
			}
			if (toolCalls.size > 0 && Object.keys(toolCallObj).length === 0) {
				onError({ message: 'Forge: model started a tool call but its arguments were incomplete or malformed.', fullError: null });
				return;
			}
		}
		onFinalMessage({ fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar, anthropicReasoning: null, ...toolCallObj });
	} catch (error) {
		onError({ message: error + '', fullError: error instanceof Error ? error : null });
	}
};


export const forgeSendFIM = async (params: SendFIMParams): Promise<void> => {
	const {
		messages,
		onFinalMessage,
		onError,
		settingsOfProvider,
		overridesOfModel,
		modelName: modelName_,
		_setAborter,
		providerName,
	} = params;

	const provider = resolveForgeProvider(providerName, settingsOfProvider);
	if (!provider) {
		onError({ message: `Forge provider "${providerName}" is not configured.`, fullError: null });
		return;
	}

	const { modelName, supportsFIM } = getModelCapabilities(providerName, modelName_, overridesOfModel);

	const abortController = new AbortController();
	_setAborter(() => abortController.abort());

	let fullText = '';
	let streamError: string | null = null;

	if (supportsFIM && provider.streamFIM) {
		try {
			const handle = await provider.streamFIM({
				model: modelName,
				prefix: messages.prefix,
				suffix: messages.suffix,
				stopTokens: messages.stopTokens,
				maxTokens: 300,
				signal: abortController.signal,
			}, (chunk) => {
				if (chunk.kind === 'error') streamError = chunk.message;
				if (chunk.kind === 'text') fullText += chunk.text;
			});

			await handle.finished;

			if (streamError) {
				onError({ message: streamError, fullError: null });
				return;
			}

			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
		} catch (error) {
			onError({ message: error + '', fullError: error instanceof Error ? error : null });
		}
	} else {
		// FALLBACK: Chat-shaped FIM completion
		// Since we don't have FIM capabilities or a streamFIM method, construct a chat message and stream it via streamChat.
		const prompt = `You are a code completion helper. Complete the code between <PRE> and <SUF>. Only output the middle code that goes directly between <PRE> and <SUF>. Do not explain, do not wrap in markdown blocks, and do not repeat <PRE> or <SUF>.
<PRE>
${messages.prefix}
</PRE>
<SUF>
${messages.suffix}
</SUF>`;

		try {
			const handle = await provider.streamChat({
				model: modelName,
				messages: [
					{ role: 'user', content: prompt }
				],
				signal: abortController.signal,
			}, (chunk) => {
				if (chunk.kind === 'error') streamError = chunk.message;
				if (chunk.kind === 'text') fullText += chunk.text;
			});

			await handle.finished;

			if (streamError) {
				onError({ message: streamError, fullError: null });
				return;
			}

			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
		} catch (error) {
			onError({ message: error + '', fullError: error instanceof Error ? error : null });
		}
	}
};


export const forgeList = (params: ListParams): void => {
	const { providerName, settingsOfProvider, onSuccess, onError } = params;
	const provider = resolveForgeProvider(providerName, settingsOfProvider);
	if (!provider) {
		onError({ error: `Unknown provider: ${providerName}` });
		return;
	}

	provider.listModels(CancellationToken.None)
		.then(({ models }) => {
			if (providerName === 'ollama') {
				onSuccess({ models: models.map(m => ({ name: m.id, ...(m.raw as any) } as OllamaModelResponse)) });
			} else {
				onSuccess({ models: models.map(m => ({ id: m.id, ...(m.raw as any) })) });
			}
		})
		.catch(error => onError({ error: error + '' }));
};
