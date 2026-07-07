/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Forge IDE. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AgentType = 'interactive' | 'background' | 'remote';
export type SessionStatus = 'running' | 'awaiting-input' | 'done' | 'error' | 'archived';
export type PermissionLevel = 'default' | 'bypass' | 'autopilot';

export interface IAgentSession {
	id: string;
	workspacePath: string;
	agentType: AgentType;
	title: string;
	createdAt: number;
	updatedAt: number;
	status: SessionStatus;
	pinned: boolean;
	providerId: string;
	modelId: string;
	permissionLevel: PermissionLevel;
	worktreePath?: string;
	/** ID of the chatThread that owns the message history */
	chatThreadId: string;
	fileChangeStats: { added: number; modified: number; deleted: number };
}

export interface ISessionCreateOpts {
	workspacePath: string;
	agentType?: AgentType;
	title?: string;
	providerId: string;
	modelId: string;
	permissionLevel?: PermissionLevel;
	chatThreadId: string;
	worktreePath?: string;
}

export interface ISessionChangedEvent {
	changed: string[];     // session IDs that were created/updated
	removed: string[];     // session IDs that were removed
}

// ── Service interface ──────────────────────────────────────────────────────────

export interface ISessionRegistryService {
	readonly _serviceBrand: undefined;

	list(filter?: { workspacePath?: string }): Promise<IAgentSession[]>;
	get(id: string): Promise<IAgentSession | undefined>;
	create(opts: ISessionCreateOpts): Promise<IAgentSession>;
	update(id: string, patch: Partial<IAgentSession>): Promise<void>;
	archive(id: string): Promise<void>;
	remove(id: string): Promise<void>;

	readonly onDidChangeSessions: Event<ISessionChangedEvent>;
}

export const ISessionRegistryService = createDecorator<ISessionRegistryService>('SessionRegistryService');
