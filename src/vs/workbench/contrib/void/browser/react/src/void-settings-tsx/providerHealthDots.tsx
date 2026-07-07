/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as React from 'react';
import { ILocalProviderRegistry, ILocalProviderRegistryService, ProviderHealth } from '../../../../../../../workbench/contrib/void/common/forgeProviderTypes.js';
import { useAllProviderHealth } from './useProviderHealth.js';


interface IProps {
	registry: ILocalProviderRegistry;
	service: ILocalProviderRegistryService;
}


/**
 * Renders a row of coloured dots, one per known provider, with a tooltip on hover.
 * Used in the status bar / settings pane.
 */
export const ProviderHealthDots: React.FC<IProps> = ({ registry, service }) => {
	const health = useAllProviderHealth(service);
	const providers = registry.all();

	if (providers.length === 0) return null;

	return (
		<div className="forge-health-dots" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
			{providers.map(p => {
				const h = health.get(p.id) ?? { status: 'unknown' as const };
				const color = COLORS[h.status];
				const tooltip = (() => {
					if (h.status === 'healthy') return `${p.displayName}: healthy (${h.models} models, ${h.latencyMs}ms)`;
					if (h.status === 'unhealthy') return `${p.displayName}: ${h.error || 'unhealthy'}`;
					if (h.status === 'checking') return `${p.displayName}: checking...`;
					return `${p.displayName}: unknown`;
				})();
				return (
					<span
						key={p.id}
						title={tooltip}
						style={{
							display: 'inline-block',
							width: 8,
							height: 8,
							borderRadius: '50%',
							background: color,
							transition: 'background 200ms',
						}}
					/>
				);
			})}
		</div>
	);
};

const COLORS: Record<ProviderHealth['status'], string> = {
	unknown: '#888',
	checking: '#e0b400',
	healthy: '#3fb950',
	unhealthy: '#f85149',
};
