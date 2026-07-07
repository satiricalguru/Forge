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
export const FORGE_HIDE_OPEN_IN_AGENTS_ACTION_ID = 'forge.action.hideOpenInAgents';

// Register Open Agents Window Action
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
			menu: [
				{
					id: MenuId.TitleBar,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.equals('config.forge.agentsWindow.showTitleBarButton', true)
				}
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		console.log('[OpenAgentsWindowAction] Running openAgentsWindow action...');
		try {
			const nativeHostService = accessor.get(INativeHostService);
			console.log('[OpenAgentsWindowAction] Retrieved nativeHostService:', !!nativeHostService);
			await nativeHostService.openAgentsWindow();
			console.log('[OpenAgentsWindowAction] openAgentsWindow promise resolved.');
		} catch (err) {
			console.error('[OpenAgentsWindowAction] Error running openAgentsWindow:', err);
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
