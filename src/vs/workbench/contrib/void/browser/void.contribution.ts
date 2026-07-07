/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/


// register inline diffs
import './editCodeService.js'

// register Sidebar pane, state, actions (keybinds, menus) (Ctrl+L)
import './sidebarActions.js'
import './sidebarPane.js'

// register quick edit (Ctrl+K)
import './quickEditActions.js'


// register Autocomplete
import './autocompleteService.js'

// register Context services
// import './contextGatheringService.js'
// import './contextUserChangesService.js'

// settings pane
import './voidSettingsPane.js'

// register css
import './media/void.css'

// update (frontend part, also see platform/) — disabled for Forge v1
// import './voidUpdateActions.js'

import './convertToLLMMessageWorkbenchContrib.js'

// tools
import './toolsService.js'
import './terminalToolService.js'

// register Thread History
import './chatThreadService.js'

// ping — telemetry disabled for Forge
// import './metricsPollService.js'

// helper services
import './helperServices/consistentItemService.js'

// register selection helper
import './voidSelectionHelperWidget.js'

// register tooltip service
import './tooltipService.js'

// register onboarding service
import './voidOnboardingService.js'

// register misc service
import './miscWokrbenchContrib.js'

// register file service (for explorer context menu)
import './fileService.js'

// register source control management
import './voidSCMService.js'

// ---------- common (unclear if these actually need to be imported, because they're already imported wherever they're used) ----------

// llmMessage
import '../common/sendLLMMessageService.js'

// forge provider layer (Phase 2)
import '../common/forgeProviderContribution.js'

// voidSettings
import '../common/voidSettingsService.js'

// refreshModel
import '../common/refreshModelService.js'

// metrics
import '../common/metricsService.js'

// updates
import '../common/voidUpdateService.js'

// model service
import '../common/voidModelService.js'

// Forge added services
import '../common/skillsService.js'
import '../common/hardwareService.js'
import '../common/sessionRegistryService.js'
import './agentsWindowActions.js'

import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';

const configRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configRegistry.registerConfiguration({
	id: 'forge',
	order: 10,
	title: 'Forge',
	type: 'object',
	properties: {
		'forge.agentsWindow.showTitleBarButton': {
			type: 'boolean',
			default: true,
			description: 'Toggle visibility of the "Open in Agents" button in the title bar.'
		}
	}
});

if (typeof globalThis !== 'undefined' && globalThis.performance) {
	console.log(`[Forge] AI Contribution modules loaded at: ${globalThis.performance.now().toFixed(2)}ms`);
}
