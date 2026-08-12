/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unexternalized-strings */

import { ISkill, ISkillsService } from '../common/skillsService.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface Frontmatter {
	name?: string;
	description?: string;
	triggerKeywords?: string[];
	allowedTools?: string[];
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {}, body: content };
	}

	const yamlText = match[1];
	const body = match[2];
	const frontmatter: Frontmatter = {};

	const lines = yamlText.split(/\r?\n/);
	let currentKey: keyof Frontmatter | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		// Check for inline key-value
		const kvMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
		if (kvMatch) {
			let rawKey = kvMatch[1];
			// Convert snake_case to camelCase
			const key = rawKey.replace(/_([a-z])/g, (_, g) => g.toUpperCase()) as keyof Frontmatter;
			let val = kvMatch[2].trim();

			if (val.startsWith("[") && val.endsWith("]")) {
				const parsedList = val.slice(1, -1).split(",").map(s => s.trim().replace(/^['"]|['"]$/g, ""));
				(frontmatter as any)[key] = parsedList;
				currentKey = null;
			} else {
				const sq = "'";
				if (val.startsWith("\"") && val.endsWith("\"")) val = val.slice(1, -1);
				else if (val.startsWith(sq) && val.endsWith(sq)) val = val.slice(1, -1);
				(frontmatter as any)[key] = val;
				currentKey = key;
			}
		} else if (trimmed.startsWith("-") && currentKey) {
			let val = trimmed.slice(1).trim();
			const sq = "'";
			if (val.startsWith("\"") && val.endsWith("\"")) val = val.slice(1, -1);
			else if (val.startsWith(sq) && val.endsWith(sq)) val = val.slice(1, -1);
			if (!Array.isArray(frontmatter[currentKey])) {
				(frontmatter as any)[currentKey] = [];
			}
			(frontmatter[currentKey] as string[]).push(val);
		}
	}

	return { frontmatter, body };
}

async function scanDirForSkills(dirPath: string): Promise<ISkill[]> {
	const skills: ISkill[] = [];
	try {
		if (!fs.existsSync(dirPath)) {
			return [];
		}
		const stats = await fs.promises.stat(dirPath);
		if (!stats.isDirectory()) {
			return [];
		}

		const children = await fs.promises.readdir(dirPath);
		for (const child of children) {
			const childPath = path.join(dirPath, child);
			const childStats = await fs.promises.stat(childPath);
			if (childStats.isDirectory()) {
				const skillFile = path.join(childPath, 'SKILL.md');
				if (fs.existsSync(skillFile)) {
					const skill = await loadSkillFile(skillFile);
					if (skill) skills.push(skill);
				} else {
					const subChildren = await fs.promises.readdir(childPath);
					for (const subChild of subChildren) {
						if (subChild.endsWith('.md')) {
							const subSkillFile = path.join(childPath, subChild);
							const skill = await loadSkillFile(subSkillFile);
							if (skill) skills.push(skill);
						}
					}
				}
			} else if (child.endsWith('.md')) {
				const skill = await loadSkillFile(childPath);
				if (skill) skills.push(skill);
			}
		}
	} catch (e) {
		console.error(`Error scanning skills in ${dirPath}:`, e);
	}
	return skills;
}

async function loadSkillFile(filePath: string): Promise<ISkill | null> {
	try {
		const content = await fs.promises.readFile(filePath, 'utf8');
		const { frontmatter, body } = parseFrontmatter(content);
		if (!frontmatter.name) {
			return null;
		}
		return {
			name: frontmatter.name,
			description: frontmatter.description ?? '',
			triggerKeywords: frontmatter.triggerKeywords ?? [],
			allowedTools: frontmatter.allowedTools,
			body: body.trim(),
			path: filePath,
		};
	} catch (e) {
		console.error(`Error loading skill file ${filePath}:`, e);
		return null;
	}
}

export class SkillsMainService implements ISkillsService {
	readonly _serviceBrand: undefined;
	private skills: ISkill[] = [];
	private watchedPaths: Set<string> = new Set();
	private watchers: Map<string, fs.FSWatcher> = new Map();
	private userSkillsDir: string;

	/** key of the workspace set the current cache was built with */
	private _cacheWorkspaceKey = '';
	/** true when the watcher saw changes or the workspace set changed */
	private _dirty = true;
	/** serializes concurrent reloads */
	private _reload: Promise<void> = Promise.resolve();
	private _lastWorkspacePaths: string[] = [];
	private _reloadDebounce: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		this.userSkillsDir = path.join(os.homedir(), '.forge', 'skills');
		if (!fs.existsSync(this.userSkillsDir)) {
			try {
				fs.mkdirSync(this.userSkillsDir, { recursive: true });
			} catch (e) {
				console.error('Failed to create user skills directory:', e);
			}
		}
		this.watchPath(this.userSkillsDir);
	}

	private watchPath(dirPath: string) {
		if (this.watchedPaths.has(dirPath)) return;
		this.watchedPaths.add(dirPath);

		try {
			if (fs.existsSync(dirPath)) {
				const watcher = fs.watch(dirPath, { recursive: true }, () => {
					// invalidate the cache and schedule a debounced background
					// reload so skill edits apply without a restart
					this._dirty = true;
					clearTimeout(this._reloadDebounce);
					this._reloadDebounce = setTimeout(() => {
						void this.reloadAll(this._lastWorkspacePaths);
					}, 300);
				});
				this.watchers.set(dirPath, watcher);
			}
		} catch (e) {
			console.error(`Failed to watch directory ${dirPath}:`, e);
		}
	}

	async reloadAll(workspacePaths: string[] = []) {
		this._lastWorkspacePaths = workspacePaths;
		// serialize reloads so concurrent calls can't interleave the scan
		const run = !this._dirty ? Promise.resolve() : this._scan(workspacePaths);
		this._dirty = false;
		await run;
	}

	private async _scan(workspacePaths: string[]) {
		const allSkills: ISkill[] = [];

		// User-level skills
		const userSkills = await scanDirForSkills(this.userSkillsDir);
		allSkills.push(...userSkills);

		// Workspace-level skills
		for (const wsPath of workspacePaths) {
			const wsSkillsDir = path.join(wsPath, '.forge', 'skills');
			if (fs.existsSync(wsSkillsDir)) {
				this.watchPath(wsSkillsDir);
				const wsSkills = await scanDirForSkills(wsSkillsDir);
				allSkills.push(...wsSkills);
			}
		}

		// Deduplicate by name (prefer workspace skills over user skills if name conflicts)
		const uniqueSkills = new Map<string, ISkill>();
		for (const skill of allSkills) {
			uniqueSkills.set(skill.name, skill);
		}
		this.skills = Array.from(uniqueSkills.values());
	}

	async getSkills(workspacePaths: string[]): Promise<ISkill[]> {
		const key = [...workspacePaths].slice().sort().join('\u0000');
		if (key !== this._cacheWorkspaceKey) {
			this._cacheWorkspaceKey = key;
			this._dirty = true;
		}
		if (!this._dirty) return this.skills;

		this._reload = this._reload.then(() => this.reloadAll(workspacePaths)).catch(() => { /* reloadAll never throws; defensive */ });
		await this._reload;
		return this.skills;
	}

	async matchSkills(userPrompt: string, workspacePaths: string[]): Promise<ISkill[]> {
		const skills = await this.getSkills(workspacePaths);
		if (!userPrompt) return [];

		const matched: { skill: ISkill; score: number }[] = [];
		const promptLower = userPrompt.toLowerCase();

		for (const skill of skills) {
			let score = 0;

			if (skill.triggerKeywords) {
				for (const keyword of skill.triggerKeywords) {
					const kwLower = keyword.toLowerCase();
					if (promptLower.includes(kwLower)) {
						score += 10;
					}
				}
			}

			if (skill.description) {
				const descWords = skill.description.toLowerCase().split(/\s+/);
				for (const word of descWords) {
					if (word.length > 3 && promptLower.includes(word)) {
						score += 1;
					}
				}
			}

			if (skill.name) {
				const nameLower = skill.name.toLowerCase();
				if (promptLower.includes(nameLower)) {
					score += 5;
				}
			}

			if (score > 0) {
				matched.push({ skill, score });
			}
		}

		return matched
			.sort((a, b) => b.score - a.score)
			.slice(0, 3)
			.map(m => m.skill);
	}

	matchSkillsSync(userPrompt: string): ISkill[] {
		if (!userPrompt) return [];
		const matched: { skill: ISkill; score: number }[] = [];
		const promptLower = userPrompt.toLowerCase();

		for (const skill of this.skills) {
			let score = 0;

			if (skill.triggerKeywords) {
				for (const keyword of skill.triggerKeywords) {
					const kwLower = keyword.toLowerCase();
					if (promptLower.includes(kwLower)) {
						score += 10;
					}
				}
			}

			if (skill.description) {
				const descWords = skill.description.toLowerCase().split(/\s+/);
				for (const word of descWords) {
					if (word.length > 3 && promptLower.includes(word)) {
						score += 1;
					}
				}
			}

			if (skill.name) {
				const nameLower = skill.name.toLowerCase();
				if (promptLower.includes(nameLower)) {
					score += 5;
				}
			}

			if (score > 0) {
				matched.push({ skill, score });
			}
		}

		return matched
			.sort((a, b) => b.score - a.score)
			.slice(0, 3)
			.map(m => m.skill);
	}

	dispose() {
		clearTimeout(this._reloadDebounce);
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
		this.watchedPaths.clear();
	}
}
