/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { LocalProviderRegistry } from './forgeProviderRegistry.js';
import { LocalProviderRegistryService } from './forgeProviderRegistryService.js';
import { ILocalProviderRegistry, ILocalProviderRegistryService } from './forgeProviderTypes.js';
import { FORGE_PROVIDERS } from './forge/index.js';


// Register the registry as a singleton (eager so providers are available at app start).
registerSingleton(ILocalProviderRegistry, LocalProviderRegistry, InstantiationType.Eager);
registerSingleton(ILocalProviderRegistryService, LocalProviderRegistryService, InstantiationType.Eager);


/**
 * Mounts the Forge provider layer:
 *   1. Registers all built-in local providers (Ollama, LM Studio, vLLM, llama.cpp, LocalAI)
 *   2. Starts auto-discovery + health probing
 *   3. Subscribes to settings changes so user-overridden endpoints are honoured
 */
class ForgeProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.forge.provider';

	constructor(
		@ILocalProviderRegistry registry: ILocalProviderRegistry,
		@ILocalProviderRegistryService service: ILocalProviderRegistryService,
	) {
		super();
		// Register the static set of providers. Subclasses/extensions may add more later.
		for (const p of FORGE_PROVIDERS) {
			this._register(registry.register(p));
		}
		// Kick auto-discovery (health pings + model refresh)
		service.startAutoDiscovery();
	}
}

registerWorkbenchContribution2(ForgeProviderContribution.ID, ForgeProviderContribution, WorkbenchPhase.BlockRestore);
