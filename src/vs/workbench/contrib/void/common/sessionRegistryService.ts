/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Forge IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import {
	IAgentSession,
	ISessionCreateOpts,
	ISessionChangedEvent,
	ISessionRegistryService,
} from './sessionRegistryTypes.js';

/**
 * Renderer-side proxy that forwards all calls to the main-process
 * SessionRegistryMainService over the 'forge-channel-sessions' IPC channel.
 *
 * Also re-emits the onDidChangeSessions event so React hooks can subscribe.
 */
export class SessionRegistryService implements ISessionRegistryService {
	readonly _serviceBrand: undefined;

	private readonly _proxy: ISessionRegistryService;

	private readonly _onDidChangeSessions = new Emitter<ISessionChangedEvent>();
	readonly onDidChangeSessions: Event<ISessionChangedEvent> = this._onDidChangeSessions.event;

	/** Local cache so list() is instant after first load */
	private _cache: IAgentSession[] = [];
	private _cacheLoaded = false;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		this._proxy = ProxyChannel.toService<ISessionRegistryService>(
			mainProcessService.getChannel('forge-channel-sessions')
		);

		// Listen to main-process events and re-fire locally
		this._proxy.onDidChangeSessions((e: ISessionChangedEvent) => {
			// Invalidate cache so next list() fetches fresh data
			this._cacheLoaded = false;
			this._onDidChangeSessions.fire(e);
		});

		// Pre-warm cache
		this._loadCache();
	}

	private async _loadCache(): Promise<void> {
		try {
			this._cache = await this._proxy.list();
			this._cacheLoaded = true;
		} catch {
			this._cache = [];
		}
	}

	async list(filter?: { workspacePath?: string }): Promise<IAgentSession[]> {
		if (!this._cacheLoaded) {
			await this._loadCache();
		}
		let result = [...this._cache];
		if (filter?.workspacePath) {
			result = result.filter(s => s.workspacePath === filter.workspacePath);
		}
		return result;
	}

	async get(id: string): Promise<IAgentSession | undefined> {
		return this._proxy.get(id);
	}

	async create(opts: ISessionCreateOpts): Promise<IAgentSession> {
		const session = await this._proxy.create(opts);
		// Optimistically add to cache
		this._cache.push(session);
		return session;
	}

	async update(id: string, patch: Partial<IAgentSession>): Promise<void> {
		await this._proxy.update(id, patch);
		// Update local cache
		const idx = this._cache.findIndex(s => s.id === id);
		if (idx >= 0) {
			Object.assign(this._cache[idx], patch);
		}
	}

	async archive(id: string): Promise<void> {
		return this._proxy.archive(id);
	}

	async remove(id: string): Promise<void> {
		await this._proxy.remove(id);
		this._cache = this._cache.filter(s => s.id !== id);
	}
}

registerSingleton(ISessionRegistryService, SessionRegistryService, InstantiationType.Eager);
