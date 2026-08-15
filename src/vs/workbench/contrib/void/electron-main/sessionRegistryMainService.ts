/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Forge IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { Emitter } from '../../../../base/common/event.js';
import {
	IAgentSession,
	ISessionCreateOpts,
	ISessionChangedEvent,
	ISessionRegistryService,
} from '../common/sessionRegistryTypes.js';

/**
 * Main-process singleton that persists agent session metadata under
 * ~/.forge/sessions/<workspace-hash>/<session-id>.json and broadcasts
 * changes to all renderer windows via the IPC proxy channel.
 */
export class SessionRegistryMainService implements ISessionRegistryService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessions = new Emitter<ISessionChangedEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _sessionsDir: string;
	/** In-memory cache keyed by session id */
	private readonly _sessions = new Map<string, IAgentSession>();
	/** In-flight/complete load promise so concurrent callers can't race the scan */
	private _loadingPromise: Promise<void> | undefined;

	constructor() {
		this._sessionsDir = path.join(os.homedir(), '.forge', 'sessions');
		this._ensureDir(this._sessionsDir);
	}

	// ── Public API ──────────────────────────────────────────────────────────

	async list(filter?: { workspacePath?: string }): Promise<IAgentSession[]> {
		await this._ensureLoaded();
		let result = Array.from(this._sessions.values());
		if (filter?.workspacePath) {
			result = result.filter(s => s.workspacePath === filter.workspacePath);
		}
		// Most-recently-updated first
		result.sort((a, b) => b.updatedAt - a.updatedAt);
		return result;
	}

	async get(id: string): Promise<IAgentSession | undefined> {
		await this._ensureLoaded();
		if (!this._isValidId(id)) return undefined;
		return this._sessions.get(id);
	}

	async create(opts: ISessionCreateOpts): Promise<IAgentSession> {
		await this._ensureLoaded();
		if (!this._isValidId(opts.chatThreadId)) {
			throw new Error(`SessionRegistry: invalid session id`);
		}
		const now = Date.now();
		const session: IAgentSession = {
			id: opts.chatThreadId, // align session ID with chatThread ID for direct mapping
			workspacePath: opts.workspacePath,
			agentType: opts.agentType ?? 'interactive',
			title: opts.title ?? 'New Session',
			createdAt: now,
			updatedAt: now,
			status: 'running',
			pinned: false,
			providerId: opts.providerId,
			modelId: opts.modelId,
			permissionLevel: opts.permissionLevel ?? 'default',
			chatThreadId: opts.chatThreadId,
			worktreePath: opts.worktreePath,
			fileChangeStats: { added: 0, modified: 0, deleted: 0 },
		};

		this._sessions.set(session.id, session);
		await this._persist(session);
		this._onDidChangeSessions.fire({ changed: [session.id], removed: [] });
		return session;
	}

	async update(id: string, patch: Partial<IAgentSession>): Promise<void> {
		await this._ensureLoaded();
		if (!this._isValidId(id)) return;
		const session = this._sessions.get(id);
		if (!session) return;

		Object.assign(session, patch, { updatedAt: Date.now() });
		await this._persist(session);
		this._onDidChangeSessions.fire({ changed: [id], removed: [] });
	}

	async archive(id: string): Promise<void> {
		return this.update(id, { status: 'archived' });
	}

	async remove(id: string): Promise<void> {
		await this._ensureLoaded();
		if (!this._isValidId(id)) return;
		const session = this._sessions.get(id);
		if (!session) return;

		this._sessions.delete(id);
		// Delete the JSON file
		const filePath = this._filePathFor(session);
		try { await fs.promises.unlink(filePath); } catch { /* ignore if already gone */ }
		this._onDidChangeSessions.fire({ changed: [], removed: [id] });
	}

	// ── Persistence helpers ─────────────────────────────────────────────────

	private _workspaceHash(workspacePath: string): string {
		let hashVal = 5381;
		for (let i = 0; i < workspacePath.length; i++) {
			hashVal = (hashVal * 33) ^ workspacePath.charCodeAt(i);
		}
		return (hashVal >>> 0).toString(16);
	}

	private _filePathFor(session: IAgentSession): string {
		const wsDir = path.join(this._sessionsDir, this._workspaceHash(session.workspacePath));
		return path.join(wsDir, `${session.id}.json`);
	}

	private async _persist(session: IAgentSession): Promise<void> {
		const filePath = this._filePathFor(session);
		this._ensureDir(path.dirname(filePath));
		try {
			let existingData: any = {};
			if (fs.existsSync(filePath)) {
				try {
					const raw = await fs.promises.readFile(filePath, 'utf8');
					existingData = JSON.parse(raw);
				} catch { /* existing file may be corrupt or empty */ }
			}

			const merged = {
				...existingData,
				id: session.id,
				title: session.title,
				createdAt: session.createdAt ? new Date(session.createdAt).toISOString() : existingData.createdAt,
				lastModified: new Date(session.updatedAt).toISOString(),
				updatedAt: session.updatedAt,
				agentType: session.agentType,
				isAuto: session.agentType === 'background',
				workspacePath: session.workspacePath,
				pinned: session.pinned,
				providerId: session.providerId,
				modelId: session.modelId,
				permissionLevel: session.permissionLevel,
				worktreePath: session.worktreePath,
				fileChangeStats: session.fileChangeStats,
				status: session.status,
				chatThreadId: session.chatThreadId
			};

			await fs.promises.writeFile(filePath, JSON.stringify(merged, null, 2), 'utf8');
			await fs.promises.chmod(filePath, 0o600);
		} catch (err) {
			console.error(`[SessionRegistry] Failed to persist session ${session.id}:`, err);
		}
	}

	private _ensureLoaded(): Promise<void> {
		if (!this._loadingPromise) {
			this._loadingPromise = this._loadSessions().catch(err => {
				console.error('[SessionRegistry] Failed to load sessions:', err);
				this._loadingPromise = undefined; // allow a later call to retry
			});
		}
		return this._loadingPromise;
	}

	private async _loadSessions(): Promise<void> {
		try {
			if (!fs.existsSync(this._sessionsDir)) return;

			const seenIds = new Set<string>();
			const wsDirs = await fs.promises.readdir(this._sessionsDir, { withFileTypes: true });
			for (const wsDir of wsDirs) {
				if (!wsDir.isDirectory()) continue;
				const wsDirPath = path.join(this._sessionsDir, wsDir.name);
				const files = await fs.promises.readdir(wsDirPath);
				for (const file of files) {
					if (!file.endsWith('.json')) continue;
					try {
						const raw = await fs.promises.readFile(path.join(wsDirPath, file), 'utf8');
						const json = JSON.parse(raw);
						if (json.id && this._isValidId(json.id)) {
							if (file !== `${json.id}.json`) continue;
							seenIds.add(json.id);
							const createdAtTime = json.createdAt ? new Date(json.createdAt).getTime() : Date.now();
							const updatedAtTime = json.updatedAt ?? (json.lastModified ? new Date(json.lastModified).getTime() : createdAtTime);
							
							const session: IAgentSession = {
								id: json.id,
								workspacePath: json.workspacePath ?? '',
								agentType: json.agentType ?? (json.isAuto ? 'background' : 'interactive'),
								title: json.title ?? 'New Session',
								createdAt: createdAtTime,
								updatedAt: updatedAtTime,
								status: json.status ?? 'done',
								pinned: json.pinned ?? false,
								providerId: json.providerId ?? '',
								modelId: json.modelId ?? '',
								permissionLevel: json.permissionLevel ?? 'default',
								chatThreadId: json.chatThreadId ?? json.id,
								worktreePath: json.worktreePath,
								fileChangeStats: json.fileChangeStats ?? { added: 0, modified: 0, deleted: 0 }
							};
							this._sessions.set(session.id, session);
						}
					} catch (e) {
						console.error(`[SessionRegistry] Failed to load session file ${file}:`, e);
					}
				}
			}

			// prune stale entries: sessions that were previously cached but no
			// longer have a file on disk (e.g. cleaned up empty files above or
			// files deleted externally)
			for (const id of Array.from(this._sessions.keys())) {
				if (!seenIds.has(id)) {
					this._sessions.delete(id);
				}
			}
		} catch (err) {
			throw err;
		}
	}

	private _isValidId(id: string | undefined): boolean {
		if (typeof id !== 'string' || id.length === 0 || id.length > 200) return false;
		// block path separators and traversal so ids can't escape the sessions dir
		return !/[\\/\0]/.test(id) && !id.includes('..');
	}

	private _ensureDir(dirPath: string): void {
		if (!fs.existsSync(dirPath)) {
			try {
				fs.mkdirSync(dirPath, { recursive: true });
			} catch { /* best effort */ }
		}
	}

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}
