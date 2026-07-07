/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ILocalProvider, ILocalProviderRegistry } from './forgeProviderTypes.js';


export class LocalProviderRegistry extends Disposable implements ILocalProviderRegistry {

	readonly _serviceBrand: undefined;

	private readonly _map = new Map<string, ILocalProvider>();

	constructor() {
		super();
	}

	register(provider: ILocalProvider): IDisposable {
		this._map.set(provider.id, provider);
		return {
			dispose: () => {
				if (this._map.get(provider.id) === provider) {
					this._map.delete(provider.id);
				}
			},
		};
	}

	get providers(): ReadonlyMap<string, ILocalProvider> {
		return this._map;
	}

	get(id: string): ILocalProvider | undefined {
		return this._map.get(id);
	}

	all(): ILocalProvider[] {
		return Array.from(this._map.values());
	}

	autoDiscoverable(): ILocalProvider[] {
		return this.all().filter(p => p.isAutoDiscoverable);
	}
}
