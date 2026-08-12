/*--------------------------------------------------------------------------------------
 *  Copyright 2026 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IHardwareInfo, IHardwareService } from '../common/hardwareService.js';
import { execFile } from 'child_process';
import * as os from 'os';

const VRAM_PROBE_TIMEOUT_MS = 2500;

function probeVram(): Promise<number | undefined> {
	return new Promise((resolve) => {
		let settled = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const settle = (value: number | undefined) => {
			if (settled) return;
			settled = true;
			if (timeout) clearTimeout(timeout);
			resolve(value);
		};

		// execFile (no shell) so a rogue binary or environment can't inject
		// arguments; bounded by a timeout so a hung probe can't block startup
		const child = execFile('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], (err, stdout) => {
			if (err || !stdout) {
				settle(undefined);
				return;
			}
			const val = parseInt(stdout.trim(), 10);
			settle(!isNaN(val) ? val / 1024 : undefined); // convert MB to GB
		});

		timeout = setTimeout(() => {
			child.kill();
			settle(undefined);
		}, VRAM_PROBE_TIMEOUT_MS);
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
