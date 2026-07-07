/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IVoidUpdateService } from '../common/voidUpdateService.js';
import { VoidCheckUpdateRespose } from '../common/voidUpdateServiceTypes.js';

/** Auto-update disabled for Forge v1 — no outbound update checks. */
export class VoidMainUpdateService extends Disposable implements IVoidUpdateService {

	declare readonly _serviceBrand: undefined;

	async check(_explicit: boolean): Promise<VoidCheckUpdateRespose> {
		return { message: null };
	}
}
