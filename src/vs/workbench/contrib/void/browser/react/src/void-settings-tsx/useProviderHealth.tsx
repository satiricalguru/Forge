/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ILocalProviderRegistryService, ProviderHealth } from '../../../../../../../workbench/contrib/void/common/forgeProviderTypes.js';


/**
 * Subscribe to a single provider's health in a React component.
 * Re-renders whenever that provider's health changes.
 */
export function useProviderHealth(
	service: ILocalProviderRegistryService | null | undefined,
	providerId: string,
): ProviderHealth {
	const [health, setHealth] = useState<ProviderHealth>(() => service ? service.getHealth(providerId) : { status: 'unknown' });

	useEffect(() => {
		if (!service) return;
		const store = new DisposableStore();
		store.add(service.onDidChangeHealth(e => {
			if (e.providerId === providerId) setHealth(e.health);
		}));
		setHealth(service.getHealth(providerId));
		return () => store.dispose();
	}, [service, providerId]);

	return health;
}


/**
 * Subscribe to the full health snapshot — used by the status-bar/health-dots strip.
 * Re-renders on any provider health change.
 */
export function useAllProviderHealth(service: ILocalProviderRegistryService | null | undefined): ReadonlyMap<string, ProviderHealth> {
	const [snapshot, setSnapshot] = useState<ReadonlyMap<string, ProviderHealth>>(() => service ? new Map(service.getAllHealth()) : new Map());

	useEffect(() => {
		if (!service) return;
		const store = new DisposableStore();
		store.add(service.onDidChangeHealth(() => {
			setSnapshot(new Map(service.getAllHealth()));
		}));
		setSnapshot(new Map(service.getAllHealth()));
		return () => store.dispose();
	}, [service]);

	return snapshot;
}
