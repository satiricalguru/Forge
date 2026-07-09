/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { localize2, localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';



export const FORGE_OPEN_AGENTS_WINDOW_ACTION_ID = 'forge.action.openAgentsWindow';
export const FORGE_TITLE_BAR_OPEN_AGENTS_ACTION_ID = 'forge.agents.openWindow';
export const FORGE_HIDE_OPEN_IN_AGENTS_ACTION_ID = 'forge.action.hideOpenInAgents';
export const FORGE_SHOW_OPEN_IN_AGENTS_ACTION_ID = 'forge.action.showOpenInAgents';



// Register Open Agents Window Action (for command palette, keybinding, and context menus)
registerAction2(class OpenAgentsWindowAction extends Action2 {
	constructor() {
		super({
			id: FORGE_OPEN_AGENTS_WINDOW_ACTION_ID,
			title: localize2('forgeOpenAgentsWindow', 'Forge: Open Agents Window'),
			shortTitle: localize('openInAgentsShort', 'Open in Agents'),
			f1: true,
			icon: Codicon.robot,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		try {
			const nativeHostService = accessor.get(INativeHostService);
			await nativeHostService.openAgentsWindow();
		} catch (err) {
			console.error('[OpenAgentsWindowAction] Error running openAgentsWindow:', err);
		}
	}
});

// Register Title Bar Open Agents Window Action (uses a fresh ID to avoid persisted hide state)
registerAction2(class TitleBarOpenAgentsWindowAction extends Action2 {
	constructor() {
		super({
			id: FORGE_TITLE_BAR_OPEN_AGENTS_ACTION_ID,
			title: localize2('forgeTitleBarOpenAgentsWindow', 'Open Agents Window'),
			shortTitle: localize('openInAgentsShort', 'Open in Agents'),
			icon: Codicon.robot,
			menu: [
				{
					id: MenuId.TitleBar,
					group: 'navigation',
					order: 1
				}
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		try {
			const nativeHostService = accessor.get(INativeHostService);
			await nativeHostService.openAgentsWindow();
		} catch (err) {
			console.error('[Forge] Error in TitleBarOpenAgentsWindowAction:', err);
		}
	}
});

// Register Hide Open in Agents Button Action
registerAction2(class HideOpenInAgentsAction extends Action2 {
	constructor() {
		super({
			id: FORGE_HIDE_OPEN_IN_AGENTS_ACTION_ID,
			title: localize('hideOpenInAgents', "Hide 'Open in Agents'"),
			menu: [
				{
					id: MenuId.TitleBarContext,
					group: '2_config',
					order: 5,
					when: ContextKeyExpr.equals('config.forge.agentsWindow.showTitleBarButton', true)
				},
				{
					id: MenuId.TitleBarTitleContext,
					group: '2_config',
					order: 5,
					when: ContextKeyExpr.equals('config.forge.agentsWindow.showTitleBarButton', true)
				}
			]
		});
	}

	override run(accessor: ServicesAccessor): void {
		const configService = accessor.get(IConfigurationService);
		configService.updateValue('forge.agentsWindow.showTitleBarButton', false);
	}
});

// Register Show Open in Agents Button Action
registerAction2(class ShowOpenInAgentsAction extends Action2 {
	constructor() {
		super({
			id: FORGE_SHOW_OPEN_IN_AGENTS_ACTION_ID,
			title: localize('showOpenInAgents', "Show 'Open in Agents' Button"),
			menu: [
				{
					id: MenuId.TitleBarContext,
					group: '2_config',
					order: 5,
				},
				{
					id: MenuId.TitleBarTitleContext,
					group: '2_config',
					order: 5,
				}
			]
		});
	}

	override run(accessor: ServicesAccessor): void {
		const configService = accessor.get(IConfigurationService);
		configService.updateValue('forge.agentsWindow.showTitleBarButton', true);
	}
});
