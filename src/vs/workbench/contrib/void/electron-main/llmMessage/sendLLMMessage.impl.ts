/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { LLMChatMessage, LLMFIMMessage, ModelListParams, OnError, OnFinalMessage, OnText } from '../../common/sendLLMMessageTypes.js';
import { ChatMode, ModelSelectionOptions, OverridesOfModel, ProviderName, SettingsOfProvider } from '../../common/voidSettingsTypes.js';
import { InternalToolInfo } from '../../common/prompt/prompts.js';
import { forgeSendChat, forgeSendFIM, forgeList } from './sendLLMMessage.forge.js';


type InternalCommonMessageParams = {
	onText: OnText;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	providerName: ProviderName;
	settingsOfProvider: SettingsOfProvider;
	modelSelectionOptions: ModelSelectionOptions | undefined;
	overridesOfModel: OverridesOfModel | undefined;
	modelName: string;
	_setAborter: (aborter: () => void) => void;
}

type SendChatParams_Internal = InternalCommonMessageParams & {
	messages: LLMChatMessage[];
	separateSystemMessage: string | undefined;
	chatMode: ChatMode | null;
	mcpTools: InternalToolInfo[] | undefined;
}
type SendFIMParams_Internal = InternalCommonMessageParams & { messages: LLMFIMMessage; separateSystemMessage: string | undefined; }
export type ListParams_Internal<ModelResponse> = ModelListParams<ModelResponse>


type CallFnOfProvider = {
	[providerName in ProviderName]: {
		sendChat: (params: SendChatParams_Internal) => Promise<void>;
		sendFIM: ((params: SendFIMParams_Internal) => void) | null;
		list: ((params: ListParams_Internal<any>) => void) | null;
	}
}

/** All local LLM traffic routes through the Forge `ILocalProvider` layer. */
export const sendLLMMessageToProviderImplementation = {
	ollama: {
		sendChat: (params) => forgeSendChat(params),
		sendFIM: (params) => forgeSendFIM(params),
		list: (params) => forgeList(params),
	},
	openAICompatible: {
		sendChat: (params) => forgeSendChat(params),
		sendFIM: (params) => forgeSendFIM(params),
		list: null,
	},
	vLLM: {
		sendChat: (params) => forgeSendChat(params),
		sendFIM: (params) => forgeSendFIM(params),
		list: (params) => forgeList(params),
	},
	lmStudio: {
		sendChat: (params) => forgeSendChat(params),
		sendFIM: (params) => forgeSendFIM(params),
		list: (params) => forgeList(params),
	},
} satisfies CallFnOfProvider
