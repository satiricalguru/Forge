/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { ILocalProvider } from '../forgeProviderTypes.js';
import { OllamaProvider } from './ollama.js';
import { LMStudioProvider } from './lmstudio.js';
import { vLLMProvider, LlamaCppProvider, LocalAIProvider } from './openaiCompatible.js';


export const FORGE_PROVIDERS: ILocalProvider[] = [
	new OllamaProvider(),
	new LMStudioProvider(),
	vLLMProvider,
	LlamaCppProvider,
	LocalAIProvider,
];
