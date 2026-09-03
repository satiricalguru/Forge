/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { BaseHttpProvider } from './baseProvider.js';
import { FORGE_PROVIDERS } from './index.js';
import { OpenAICompatibleProvider } from './openaiCompatible.js';
import { ILocalProvider } from '../forgeProviderTypes.js';
import { ProviderName, SettingsOfProvider } from '../voidSettingsTypes.js';


const STATIC_PROVIDER_ID: Record<ProviderName, string | null> = {
	ollama: 'ollama',
	vLLM: 'vllm',
	lmStudio: 'lmstudio',
	openAICompatible: null,
};


function parseHeadersJSON(s: string | undefined): Record<string, string> | undefined {
	if (!s) return undefined;
	try {
		const parsed = JSON.parse(s) as Record<string, string | null | undefined>;
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(parsed)) {
			if (typeof v === 'string') out[k] = v;
		}
		return out;
	} catch {
		return undefined;
	}
}


/** Clone a provider instance with the user's endpoint override applied. */
export function bindForgeProviderEndpoint(provider: ILocalProvider, userEndpoint: string | undefined): ILocalProvider {
	if (provider instanceof BaseHttpProvider) {
		const bound = Object.create(Object.getPrototypeOf(provider)) as BaseHttpProvider;
		Object.assign(bound, provider);
		bound.endpointOverride = userEndpoint;
		// customHeaders is mutable — clone so bound instances don't share state
		// with the singleton or each other.
		const headers = (provider as { customHeaders?: Record<string, string> }).customHeaders;
		if (headers) {
			(bound as { customHeaders?: Record<string, string> }).customHeaders = { ...headers };
		}
		return bound;
	}
	return provider;
}


function userEndpointOf(providerName: ProviderName, settings: SettingsOfProvider): string | undefined {
	const cfg = settings[providerName] as { endpoint?: string } | undefined;
	return cfg?.endpoint;
}


/**
 * Resolve the forge `ILocalProvider` for a Void settings provider name,
 * honouring the user's configured endpoint.
 */
export function resolveForgeProvider(providerName: ProviderName, settingsOfProvider: SettingsOfProvider): ILocalProvider | undefined {
	const userEndpoint = userEndpointOf(providerName, settingsOfProvider);
	const staticId = STATIC_PROVIDER_ID[providerName];

	if (staticId) {
		const base = FORGE_PROVIDERS.find(p => p.id === staticId);
		return base ? bindForgeProviderEndpoint(base, userEndpoint) : undefined;
	}

	if (providerName === 'openAICompatible') {
		const cfg = settingsOfProvider.openAICompatible;
		const headers = parseHeadersJSON(cfg.headersJSON);
		const rawEndpoint = (cfg.endpoint || '').trim();
		if (!rawEndpoint) return undefined;
		const provider = new OpenAICompatibleProvider({
			id: 'openaicompatible',
			displayName: 'Custom endpoint',
			defaultEndpoint: rawEndpoint.replace(/\/v1\/?$/, ''),
			apiKey: cfg.apiKey || 'noop',
		});
		if (headers) provider.customHeaders = headers;
		return provider;
	}

	return undefined;
}
