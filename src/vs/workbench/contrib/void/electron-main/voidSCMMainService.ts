/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { promisify } from 'util'
import { execFile as _execFile } from 'child_process'
import type { ExecFileOptions } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { IVoidSCMService } from '../common/voidSCMTypes.js'

interface NumStat {
	file: string
	added: number
	removed: number
}

const execFile = promisify(_execFile)

//8000 and 10 were chosen after some experimentation on small-to-moderately sized changes
const MAX_DIFF_LENGTH = 8000
const MAX_DIFF_FILES = 10

const git = async (args: string[], cwdPath: string, options?: ExecFileOptions): Promise<string> => {
	const { stdout, stderr } = await execFile('git', args, { cwd: cwdPath, ...options })
	if (stderr) {
		// git checkout or show might output warnings to stderr, but if stdout has content we still treat it as success
		if (!stdout) {
			throw new Error(stderr)
		}
	}
	return stdout.trim()
}

const getNumStat = async (path: string, useStagedChanges: boolean): Promise<NumStat[]> => {
	const output = await git(['diff', '--numstat', ...(useStagedChanges ? ['--staged'] : [])], path)
	return output
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const [added, removed, file] = line.split('\t')
			return {
				file,
				added: parseInt(added, 10) || 0,
				removed: parseInt(removed, 10) || 0,
			}
		})
}

const getSampledDiff = async (file: string, path: string, useStagedChanges: boolean): Promise<string> => {
	const diff = await git(['diff', '--unified=0', '--no-color', ...(useStagedChanges ? ['--staged'] : []), '--', file], path)
	return diff.slice(0, MAX_DIFF_LENGTH)
}

const hasStagedChanges = async (path: string): Promise<boolean> => {
	const output = await git(['diff', '--staged', '--name-only'], path)
	return output.length > 0
}

export class VoidSCMService implements IVoidSCMService {
	readonly _serviceBrand: undefined

	async gitStat(path: string): Promise<string> {
		const useStagedChanges = await hasStagedChanges(path)
		return git(['diff', '--stat', ...(useStagedChanges ? ['--staged'] : [])], path)
	}

	async gitSampledDiffs(path: string): Promise<string> {
		const useStagedChanges = await hasStagedChanges(path)
		const numStatList = await getNumStat(path, useStagedChanges)
		const topFiles = numStatList
			.sort((a, b) => (b.added + b.removed) - (a.added + a.removed))
			.slice(0, MAX_DIFF_FILES)
		const diffs = await Promise.all(topFiles.map(async ({ file }) => ({ file, diff: await getSampledDiff(file, path, useStagedChanges) })))
		return diffs.map(({ file, diff }) => `==== ${file} ====\n${diff}`).join('\n\n')
	}

	gitBranch(path: string): Promise<string> {
		return git(['branch', '--show-current'], path)
	}

	gitLog(path: string): Promise<string> {
		return git(['log', '--pretty=format:%h|%s|%ad', '--date=short', '--no-merges', '-n', '5'], path)
	}

	async gitStatus(pathStr: string): Promise<{ file: string; status: string }[]> {
		try {
			const output = await git(['status', '--porcelain'], pathStr);
			if (!output) return [];
			return output.split('\n').filter(Boolean).map(line => {
				const statusCode = line.slice(0, 2);
				const file = line.slice(3).trim();
				let status = 'modified';
				if (statusCode.includes('A')) status = 'added';
				else if (statusCode.includes('D')) status = 'deleted';
				else if (statusCode.includes('?')) status = 'untracked';
				return { file, status };
			});
		} catch (err) {
			console.error('[VoidSCM] Error in gitStatus:', err);
			return [];
		}
	}

	async gitDiff(pathStr: string, file: string): Promise<string> {
		try {
			return await git(['diff', 'HEAD', '--', file], pathStr);
		} catch {
			try {
				const content = await fs.promises.readFile(path.join(pathStr, file), 'utf8');
				return content.split('\n').map(line => `+${line}`).join('\n');
			} catch {
				return '';
			}
		}
	}

	async gitDiscard(pathStr: string, file?: string): Promise<void> {
		try {
			if (file) {
				await git(['checkout', 'HEAD', '--', file], pathStr).catch(err => console.warn(`[VoidSCM] checkout failed for ${file}:`, err));
				await git(['clean', '-fd', '--', file], pathStr).catch(err => console.warn(`[VoidSCM] clean failed for ${file}:`, err));
			} else {
				await git(['reset', '--hard', 'HEAD'], pathStr);
				await git(['clean', '-fd'], pathStr);
			}
		} catch (err) {
			console.error('[VoidSCM] Error in gitDiscard:', err);
		}
	}

	async gitAdd(pathStr: string, file: string): Promise<void> {
		try {
			await git(['add', '--', file], pathStr);
		} catch (err) {
			console.error('[VoidSCM] Error in gitAdd:', err);
		}
	}

	async gitCommit(pathStr: string, message: string): Promise<void> {
		try {
			await git(['add', '-A'], pathStr);
			await git(['commit', '-m', message], pathStr);
		} catch (err) {
			console.error('[VoidSCM] Error in gitCommit:', err);
			throw err;
		}
	}
}