/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IHardwareInfo, IHardwareService } from '../common/hardwareService.js';
import { exec } from 'child_process';
import * as os from 'os';

function probeVram(): Promise<number | undefined> {
	return new Promise((resolve) => {
		exec('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits', (err, stdout) => {
			if (err || !stdout) {
				resolve(undefined);
				return;
			}
			const val = parseInt(stdout.trim(), 10);
			if (!isNaN(val)) {
				resolve(val / 1024); // convert MB to GB
			} else {
				resolve(undefined);
			}
		});
	});
}

export class HardwareMainService implements IHardwareService {
	readonly _serviceBrand: undefined;

	async getHardwareInfo(): Promise<IHardwareInfo> {
		const totalRamGb = os.totalmem() / (1024 * 1024 * 1024);
		const isAppleSilicon = os.platform() === 'darwin' && os.arch() === 'arm64';
		const gpuVramGb = await probeVram();

		return {
			totalRamGb: Math.round(totalRamGb * 10) / 10,
			gpuVramGb: gpuVramGb ? Math.round(gpuVramGb * 10) / 10 : undefined,
			isAppleSilicon,
		};
	}
}
