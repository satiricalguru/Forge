/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILocalProvider, ModelCapabilities, ModelList, ProviderHealth, UNKNOWN_CAPABILITIES } from '../forgeProviderTypes.js';


/**
 * Base class for HTTP-based local LLM providers. Subclasses implement
 * `endpointFor`, `parseModelList`, and `capabilitiesFor`.
 */
export abstract class BaseHttpProvider implements ILocalProvider {

	abstract readonly id: string;
	abstract readonly displayName: string;
	abstract readonly defaultEndpoint: string;
	readonly isAutoDiscoverable: boolean = true;

	/** Set by `bindForgeProviderEndpoint` before each request. */
	endpointOverride?: string;

	resolveEndpoint(userOverride: string | undefined): string {
		const ep = userOverride?.trim() || this.defaultEndpoint;
		return ep.replace(/\/+$/, ''); // strip trailing slash
	}

	/** Active base URL for this request (honours user override from settings). */
	protected endpoint(): string {
		return this.resolveEndpoint(this.endpointOverride);
	}

	async healthcheck(token: CancellationToken): Promise<ProviderHealth> {
		try {
			const start = Date.now();
			const models = await this._probeModels(token);
			const latency = Date.now() - start;
			if (token.isCancellationRequested) {
				return { status: 'unknown' };
			}
			return { status: 'healthy', latencyMs: latency, models: models.length };
		} catch (err) {
			if (token.isCancellationRequested) {
				return { status: 'unknown' };
			}
			return { status: 'unhealthy', error: (err instanceof Error ? err.message : String(err)), latencyMs: 0 };
		}
	}

	listModels(token: CancellationToken): Promise<ModelList> {
		return this._probeModels(token).then(models => ({ models }));
	}

	// subclasses may override
	capabilitiesFor(_modelId: string): ModelCapabilities {
		return UNKNOWN_CAPABILITIES;
	}

	abstract streamChat(req: import('../../common/forgeProviderTypes.js').ChatRequest, onChunk: (c: import('../../common/forgeProviderTypes.js').StreamChunk) => void): Promise<import('../../common/forgeProviderTypes.js').ChatStreamHandle>;

	// default FIM: not supported; subclasses can override
	streamFIM(_req: import('../forgeProviderTypes.js').FIMRequest, _onChunk: (c: import('../forgeProviderTypes.js').StreamChunk) => void): Promise<import('../forgeProviderTypes.js').ChatStreamHandle> {
		throw new Error(`${this.displayName} does not support FIM.`);
	}

	/**
	 * Subclasses implement this to fetch the raw model list (used by both
	 * `healthcheck` and `listModels`).
	 */
	protected abstract _probeModels(token: CancellationToken): Promise<{ id: string; raw?: unknown }[]>;
}
