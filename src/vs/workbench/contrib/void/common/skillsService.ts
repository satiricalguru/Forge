/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';

export interface ISkill {
	name: string;
	description: string;
	triggerKeywords?: string[];
	allowedTools?: string[];
	body: string;
	path: string;
}

export interface ISkillsService {
	readonly _serviceBrand: undefined;
	getSkills(workspacePaths: string[]): Promise<ISkill[]>;
	matchSkills(userPrompt: string, workspacePaths: string[]): Promise<ISkill[]>;
	matchSkillsSync(userPrompt: string): ISkill[];
}

export const ISkillsService = createDecorator<ISkillsService>('SkillsService');

export class SkillsService implements ISkillsService {
	readonly _serviceBrand: undefined;
	private readonly _proxy: ISkillsService;
	private _cachedSkills: ISkill[] = [];

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		this._proxy = ProxyChannel.toService<ISkillsService>(mainProcessService.getChannel('void-channel-skills'));
		// Fetch skills after a delay to keep the startup path clean
		setTimeout(() => {
			this.getSkills([]).then(skills => {
				this._cachedSkills = skills;
			}).catch(() => {});
		}, 3000);
	}

	getSkills(workspacePaths: string[]): Promise<ISkill[]> {
		return this._proxy.getSkills(workspacePaths).then(skills => {
			this._cachedSkills = skills;
			return skills;
		});
	}

	matchSkills(userPrompt: string, workspacePaths: string[]): Promise<ISkill[]> {
		return this._proxy.matchSkills(userPrompt, workspacePaths).then(skills => {
			// Update cache if we matched them (since this loads them)
			this.getSkills(workspacePaths).catch(() => {});
			return skills;
		});
	}

	matchSkillsSync(userPrompt: string): ISkill[] {
		if (!userPrompt) return [];
		const matched: { skill: ISkill; score: number }[] = [];
		const promptLower = userPrompt.toLowerCase();

		for (const skill of this._cachedSkills) {
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
}

registerSingleton(ISkillsService, SkillsService, InstantiationType.Eager);
