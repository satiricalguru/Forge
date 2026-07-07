/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';

export interface IHardwareInfo {
	totalRamGb: number;
	gpuVramGb?: number;
	isAppleSilicon: boolean;
}

export interface IHardwareService {
	readonly _serviceBrand: undefined;
	getHardwareInfo(): Promise<IHardwareInfo>;
}

export const IHardwareService = createDecorator<IHardwareService>('HardwareService');

export class HardwareService implements IHardwareService {
	readonly _serviceBrand: undefined;
	private readonly _proxy: IHardwareService;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		this._proxy = ProxyChannel.toService<IHardwareService>(mainProcessService.getChannel('void-channel-hardware'));
	}

	getHardwareInfo(): Promise<IHardwareInfo> {
		return this._proxy.getHardwareInfo();
	}
}

registerSingleton(IHardwareService, HardwareService, InstantiationType.Eager);
