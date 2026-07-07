/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMetricsService } from '../common/metricsService.js';

/** No-op metrics — Forge has no telemetry. */
export class MetricsMainService extends Disposable implements IMetricsService {

	declare readonly _serviceBrand: undefined;

	capture: IMetricsService['capture'] = () => { };

	setOptOut: IMetricsService['setOptOut'] = () => { };

	getDebuggingProperties: IMetricsService['getDebuggingProperties'] = async () => ({});
}
