/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';

export interface IMetricsService {
	readonly _serviceBrand: undefined;
	capture(event: string, params: Record<string, any>): void;
	setOptOut(newVal: boolean): void;
	getDebuggingProperties(): Promise<Record<string, any>>;
}

export const IMetricsService = createDecorator<IMetricsService>('metricsService');

/** Browser-side no-op proxy — Forge has no telemetry. */
export class MetricsService implements IMetricsService {
	declare readonly _serviceBrand: undefined;

	private readonly metricsService: IMetricsService;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		this.metricsService = ProxyChannel.toService<IMetricsService>(mainProcessService.getChannel('void-channel-metrics'));
	}

	capture(..._params: Parameters<IMetricsService['capture']>) { }

	setOptOut(..._params: Parameters<IMetricsService['setOptOut']>) { }

	getDebuggingProperties() {
		return this.metricsService.getDebuggingProperties();
	}
}

registerSingleton(IMetricsService, MetricsService, InstantiationType.Eager);
