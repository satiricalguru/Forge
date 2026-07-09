/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ILocalProvider, ILocalProviderRegistry, ILocalProviderRegistryService, ModelList, ProviderHealth, UNKNOWN_CAPABILITIES } from './forgeProviderTypes.js';
import { resolveForgeProvider } from './forge/forgeProviderResolve.js';
import { IVoidSettingsService } from './voidSettingsService.js';
import { ProviderName, SettingsAtProvider } from './voidSettingsTypes.js';


const HEALTH_CHECK_INTERVAL_MS = 7_000;
const HEALTH_PROBE_TIMEOUT_MS = 2_500;
const BACKOFF_BASE_MS = 7_000;
const BACKOFF_MAX_MS = 120_000;
const BACKOFF_MULTIPLIER = 2;


export class LocalProviderRegistryService extends Disposable implements ILocalProviderRegistryService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeHealth = new Emitter<{ providerId: string; health: ProviderHealth }>();
	readonly onDidChangeHealth: Event<{ providerId: string; health: ProviderHealth }> = this._onDidChangeHealth.event;

	private readonly _health = new Map<string, ProviderHealth>();
	private _discoveryTimer: NodeJS.Timeout | null = null;
	private _activeProbe: CancellationTokenSource | null = null;

	/** Per-provider backoff state keyed by provider id */
	private readonly _backoffOfProviderId = new Map<string, { attempt: number; nextProbeAt: number }>();

	constructor(
		@ILocalProviderRegistry private readonly registry: ILocalProviderRegistry,
		@IVoidSettingsService private readonly settingsService: IVoidSettingsService,
	) {
		super();

		// initialize to 'unknown' so the UI has something to render
		for (const p of this.registry.all()) {
			this._health.set(p.id, { status: 'unknown' });
		}
	}

	getHealth(providerId: string): ProviderHealth {
		return this._health.get(providerId) ?? { status: 'unknown' };
	}

	getAllHealth(): ReadonlyMap<string, ProviderHealth> {
		return this._health;
	}

	async forceCheck(providerId: string): Promise<ProviderHealth> {
		const provider = this.registry.get(providerId);
		if (!provider) return { status: 'unknown' };
		this._backoffOfProviderId.delete(providerId);
		return this._probe(provider);
	}

	startAutoDiscovery(): void {
		if (this._discoveryTimer) return;

		// kick once immediately, then schedule
		void this._tickAll();
		this._discoveryTimer = setInterval(() => void this._tickAll(), HEALTH_CHECK_INTERVAL_MS);
		this._register({ dispose: () => { if (this._discoveryTimer) { clearInterval(this._discoveryTimer); this._discoveryTimer = null; } } });
	}

	private async _tickAll(): Promise<void> {
		// cancel any in-flight probe so we don't pile them up
		if (this._activeProbe) {
			this._activeProbe.cancel();
			this._activeProbe = null;
		}
		const cts = new CancellationTokenSource();
		this._activeProbe = cts;
		const now = Date.now();

		for (const provider of this.registry.all()) {
			if (cts.token.isCancellationRequested) return;

			const backoff = this._backoffOfProviderId.get(provider.id);
			if (backoff && now < backoff.nextProbeAt) continue;

			await this._probe(provider, cts.token);
		}
	}

	private async _probe(provider: ILocalProvider, outerToken?: CancellationToken): Promise<ProviderHealth> {
		this._setHealth(provider.id, { status: 'checking' });

		const localCts = new CancellationTokenSource(outerToken);
		const timer = setTimeout(() => localCts.cancel(), HEALTH_PROBE_TIMEOUT_MS);

		const start = Date.now();
		try {
			const result = await provider.healthcheck(localCts.token);
			const latency = Date.now() - start;
			clearTimeout(timer);
			localCts.dispose();

			let health: ProviderHealth;
			if (result.status === 'healthy') {
				health = { status: 'healthy', latencyMs: latency, models: result.models };
				this._backoffOfProviderId.delete(provider.id);
			} else if (result.status === 'unhealthy') {
				health = { status: 'unhealthy', error: result.error, latencyMs: latency };
				this._scheduleBackoff(provider.id);
			} else {
				health = result;
				this._scheduleBackoff(provider.id);
			}
			this._setHealth(provider.id, health);
			return health;
		} catch (err) {
			clearTimeout(timer);
			localCts.dispose();
			const health: ProviderHealth = { status: 'unhealthy', error: (err instanceof Error ? err.message : String(err)), latencyMs: Date.now() - start };
			this._setHealth(provider.id, health);
			this._scheduleBackoff(provider.id);
			return health;
		}
	}

	private _scheduleBackoff(providerId: string): void {
		const current = this._backoffOfProviderId.get(providerId);
		const attempt = (current?.attempt ?? 0) + 1;
		const delay = Math.min(BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1), BACKOFF_MAX_MS);
		this._backoffOfProviderId.set(providerId, { attempt, nextProbeAt: Date.now() + delay });
	}

	private _setHealth(providerId: string, health: ProviderHealth): void {
		this._health.set(providerId, health);
		this._onDidChangeHealth.fire({ providerId, health });
	}

	// ----- Public helpers used by RefreshModelService & other services -----

	/**
	 * Resolve the current endpoint for a ProviderName (using user override if set).
	 */
	endpointFor(providerName: ProviderName): string {
		const provider = resolveForgeProvider(providerName, this.settingsService.state.settingsOfProvider);
		if (!provider) return '';
		const settingsAtProvider = this.settingsService.state.settingsOfProvider[providerName] as SettingsAtProvider<ProviderName>;
		const userEndpoint = (settingsAtProvider as { endpoint?: string }).endpoint;
		return provider.resolveEndpoint(userEndpoint);
	}

	/**
	 * Pull the auto-discovered model list for a ProviderName (used to populate the model picker).
	 */
	async listModelsFor(providerName: ProviderName, token = new CancellationTokenSource().token): Promise<ModelList> {
		const provider = resolveForgeProvider(providerName, this.settingsService.state.settingsOfProvider);
		if (!provider) return { models: [] };
		try {
			return await provider.listModels(token);
		} catch {
			return { models: [] };
		}
	}

	/**
	 * Look up capabilities for a (provider, model) pair.
	 */
	capabilitiesFor(providerName: ProviderName, modelName: string) {
		const provider = resolveForgeProvider(providerName, this.settingsService.state.settingsOfProvider);
		if (!provider) return UNKNOWN_CAPABILITIES;
		return provider.capabilitiesFor(modelName);
	}

	/**
	 * Get the ILocalProvider for a given ProviderName.
	 */
	providerFor(providerName: ProviderName): ILocalProvider | undefined {
		return resolveForgeProvider(providerName, this.settingsService.state.settingsOfProvider);
	}
}
