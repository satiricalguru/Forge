/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IVoidSCMService {
	readonly _serviceBrand: undefined;
	/**
	 * Get git diff --stat
	 *
	 * @param path Path to the git repository
	 */
	gitStat(path: string): Promise<string>
	/**
	 * Get git diff --stat for the top 10 most significantly changed files according to lines added/removed
	 *
	 * @param path Path to the git repository
	 */
	gitSampledDiffs(path: string): Promise<string>
	/**
	 * Get the current git branch
	 *
	 * @param path Path to the git repository
	 */
	gitBranch(path: string): Promise<string>
	/**
	 * Get the last 5 commits excluding merges
	 *
	 * @param path Path to the git repository
	 */
	gitLog(path: string): Promise<string>
	/**
	 * Get git status --porcelain
	 */
	gitStatus(path: string): Promise<{ file: string; status: string }[]>
	/**
	 * Get unified diff for a file
	 */
	gitDiff(path: string, file: string): Promise<string>
	/**
	 * Discard changes in a file, or all files
	 */
	gitDiscard(path: string, file?: string): Promise<void>
	/**
	 * Add file to git index
	 */
	gitAdd(path: string, file: string): Promise<void>
	/**
	 * Commit with message
	 */
	gitCommit(path: string, message: string): Promise<void>
}

export const IVoidSCMService = createDecorator<IVoidSCMService>('voidSCMService')
