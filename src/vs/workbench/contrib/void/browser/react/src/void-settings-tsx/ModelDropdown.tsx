/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FeatureName, featureNames, isFeatureNameDisabled, ModelSelection, modelSelectionsEqual, ProviderName, providerNames, SettingsOfProvider } from '../../../../../../../workbench/contrib/void/common/voidSettingsTypes.js'
import { useSettingsState, useRefreshModelState, useAccessor } from '../util/services.js'
import { _VoidSelectBox, VoidCustomDropdownBox } from '../util/inputs.js'
import { SelectBox } from '../../../../../../../base/browser/ui/selectBox/selectBox.js'
import { IconWarning } from '../sidebar-tsx/SidebarChat.js'
import { VOID_OPEN_SETTINGS_ACTION_ID, VOID_TOGGLE_SETTINGS_ACTION_ID } from '../../../voidSettingsPane.js'
import { modelFilterOfFeatureName, ModelOption } from '../../../../../../../workbench/contrib/void/common/voidSettingsService.js'
import { WarningBox } from './WarningBox.js'
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js'

const optionsEqual = (m1: ModelOption[], m2: ModelOption[]) => {
	if (m1.length !== m2.length) return false
	for (let i = 0; i < m1.length; i++) {
		if (!modelSelectionsEqual(m1[i].selection, m2[i].selection)) return false
	}
	return true
}

import { IHardwareService } from '../../../../../../../workbench/contrib/void/common/hardwareService.js'

function estimateModelSizeGb(modelName: string): number {
	const lower = modelName.toLowerCase();
	const match = lower.match(/(\d+(?:\.\d+)?)\s*b/);
	if (match) {
		const params = parseFloat(match[1]);
		return params * 0.7; // ~0.7 GB VRAM/RAM required per billion parameters for Q4 quant + context
	}
	if (lower.includes('llama3') && !lower.includes('70b')) return 5.6;
	if (lower.includes('qwen') && lower.includes('coder')) return 5.6;
	if (lower.includes('deepseek-r1')) {
		if (lower.includes('1.5b')) return 1.1;
		if (lower.includes('7b') || lower.includes('8b')) return 5.6;
		if (lower.includes('14b')) return 9.8;
		if (lower.includes('32b')) return 22.4;
		if (lower.includes('70b')) return 49.0;
		return 5.6;
	}
	return 4.0;
}

const ModelSelectBox = ({ options, featureName, className }: { options: ModelOption[], featureName: FeatureName, className: string }) => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const hardwareService = accessor.get('IHardwareService')

	const [hardwareInfo, setHardwareInfo] = useState<any>(null)

	useEffect(() => {
		hardwareService.getHardwareInfo().then(info => {
			setHardwareInfo(info);
		}).catch(err => console.warn('[ModelDropdown] Failed to fetch hardware info:', err));
	}, [hardwareService]);

	const selection = voidSettingsService.state.modelSelectionOfFeature[featureName]
	const selectedOption = selection ? voidSettingsService.state._modelOptions.find(v => modelSelectionsEqual(v.selection, selection))! : options[0]

	const onChangeOption = useCallback((newOption: ModelOption) => {
		voidSettingsService.setModelSelectionOfFeature(featureName, newOption.selection)
	}, [voidSettingsService, featureName])

	const getModelFitStatus = useCallback((modelName: string) => {
		if (!hardwareInfo) return '';
		const sizeGb = estimateModelSizeGb(modelName);
		const availableMemory = hardwareInfo.gpuVramGb || hardwareInfo.totalRamGb;
		
		if (availableMemory >= sizeGb * 1.5) {
			return '● Comfortable';
		} else if (availableMemory >= sizeGb) {
			return '● Tight';
		} else {
			return '● OOM Risk';
		}
	}, [hardwareInfo]);

	return <VoidCustomDropdownBox
		options={options}
		selectedOption={selectedOption}
		onChangeOption={onChangeOption}
		getOptionDisplayName={(option) => {
			const fit = getModelFitStatus(option.selection.modelName);
			return `${option.selection.modelName}${fit ? ` (${fit})` : ''}`;
		}}
		getOptionDropdownName={(option) => option.selection.modelName}
		getOptionDropdownDetail={(option) => {
			const fit = getModelFitStatus(option.selection.modelName);
			return `${option.selection.providerName}${fit ? ` (${fit})` : ''}`;
		}}
		getOptionsEqual={(a, b) => optionsEqual([a], [b])}
		className={className}
		matchInputWidth={false}
	/>
}


const MemoizedModelDropdown = ({ featureName, className }: { featureName: FeatureName, className: string }) => {
	const settingsState = useSettingsState()
	const oldOptionsRef = useRef<ModelOption[]>([])
	const [memoizedOptions, setMemoizedOptions] = useState(oldOptionsRef.current)

	const { filter, emptyMessage } = modelFilterOfFeatureName[featureName]

	useEffect(() => {
		const oldOptions = oldOptionsRef.current
		const newOptions = settingsState._modelOptions.filter((o) => filter(o.selection, { chatMode: settingsState.globalSettings.chatMode, overridesOfModel: settingsState.overridesOfModel }))

		if (!optionsEqual(oldOptions, newOptions)) {
			setMemoizedOptions(newOptions)
		}
		oldOptionsRef.current = newOptions
	}, [settingsState._modelOptions, filter])

	if (memoizedOptions.length === 0) { // Pretty sure this will never be reached unless filter is enabled
		return <WarningBox text={emptyMessage?.message || 'No models available'} />
	}

	return <ModelSelectBox featureName={featureName} options={memoizedOptions} className={className} />

}

export const ModelDropdown = ({ featureName, className }: { featureName: FeatureName, className: string }) => {
	const settingsState = useSettingsState()

	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')

	const openSettings = () => { commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID); };


	const { emptyMessage } = modelFilterOfFeatureName[featureName]

	const isDisabled = isFeatureNameDisabled(featureName, settingsState)
	if (isDisabled)
		return <WarningBox onClick={openSettings} text={
			emptyMessage && emptyMessage.priority === 'always' ? emptyMessage.message :
				isDisabled === 'needToEnableModel' ? 'Enable a model'
					: isDisabled === 'addModel' ? 'Add a model'
						: (isDisabled === 'addProvider' || isDisabled === 'notFilledIn' || isDisabled === 'providerNotAutoDetected') ? 'Provider required'
							: 'Provider required'
		} />

	return <ErrorBoundary>
		<MemoizedModelDropdown featureName={featureName} className={className} />
	</ErrorBoundary>
}
