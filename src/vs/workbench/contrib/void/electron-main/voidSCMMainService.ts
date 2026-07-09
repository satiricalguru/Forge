/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { promisify } from 'util'
import { exec as _exec } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { IVoidSCMService } from '../common/voidSCMTypes.js'

interface NumStat {
	file: string
	added: number
	removed: number
}

const exec = promisify(_exec)

//8000 and 10 were chosen after some experimentation on small-to-moderately sized changes
const MAX_DIFF_LENGTH = 8000
const MAX_DIFF_FILES = 10

const git = async (command: string, cwdPath: string): Promise<string> => {
	const { stdout, stderr } = await exec(`${command}`, { cwd: cwdPath })
	if (stderr) {
		// git checkout or show might output warnings to stderr, but if stdout has content we still treat it as success
		if (!stdout) {
			throw new Error(stderr)
		}
	}
	return stdout.trim()
}

const getNumStat = async (path: string, useStagedChanges: boolean): Promise<NumStat[]> => {
	const staged = useStagedChanges ? '--staged' : ''
	const output = await git(`git diff --numstat ${staged}`, path)
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
	const staged = useStagedChanges ? '--staged' : ''
	const diff = await git(`git diff --unified=0 --no-color ${staged} -- "${file}"`, path)
	return diff.slice(0, MAX_DIFF_LENGTH)
}

const hasStagedChanges = async (path: string): Promise<boolean> => {
	const output = await git('git diff --staged --name-only', path)
	return output.length > 0
}

export class VoidSCMService implements IVoidSCMService {
	readonly _serviceBrand: undefined

	async gitStat(path: string): Promise<string> {
		const useStagedChanges = await hasStagedChanges(path)
		const staged = useStagedChanges ? '--staged' : ''
		return git(`git diff --stat ${staged}`, path)
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
		return git('git branch --show-current', path)
	}

	gitLog(path: string): Promise<string> {
		return git('git log --pretty=format:"%h|%s|%ad" --date=short --no-merges -n 5', path)
	}

	async gitStatus(pathStr: string): Promise<{ file: string; status: string }[]> {
		try {
			const output = await git('git status --porcelain', pathStr);
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
			return await git(`git diff HEAD -- "${file}"`, pathStr);
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
				await exec(`git checkout HEAD -- "${file}"`, { cwd: pathStr }).catch(err => console.warn(`[VoidSCM] checkout failed for ${file}:`, err));
				await exec(`git clean -fd -- "${file}"`, { cwd: pathStr }).catch(err => console.warn(`[VoidSCM] clean failed for ${file}:`, err));
			} else {
				await exec('git reset --hard HEAD', { cwd: pathStr });
				await exec('git clean -fd', { cwd: pathStr });
			}
		} catch (err) {
			console.error('[VoidSCM] Error in gitDiscard:', err);
		}
	}

	async gitAdd(pathStr: string, file: string): Promise<void> {
		try {
			await git(`git add "${file}"`, pathStr);
		} catch (err) {
			console.error('[VoidSCM] Error in gitAdd:', err);
		}
	}

	async gitCommit(pathStr: string, message: string): Promise<void> {
		try {
			await exec('git add -A', { cwd: pathStr });
			await exec(`git commit -m "${message}"`, { cwd: pathStr });
		} catch (err) {
			console.error('[VoidSCM] Error in gitCommit:', err);
			throw err;
		}
	}

	async gitGetOriginalFile(pathStr: string, file: string): Promise<string> {
		try {
			const tmpDir = path.join(pathStr, '.forge', 'tmp');
			if (!fs.existsSync(tmpDir)) {
				fs.mkdirSync(tmpDir, { recursive: true });
			}
			const content = await git(`git show HEAD:"${file}"`, pathStr).catch(err => { console.warn(`[VoidSCM] git show HEAD failed for ${file}:`, err); return ''; });
			const tempFilePath = path.join(tmpDir, `${Date.now()}-${file.replace(/[\/\\]/g, '_')}`);
			await fs.promises.writeFile(tempFilePath, content, 'utf8');
			return tempFilePath;
		} catch (err) {
			console.error('[VoidSCM] Error in gitGetOriginalFile:', err);
			return '';
		}
	}
}
