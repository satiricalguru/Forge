/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from 'react';
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js';
import { Check, ChevronRight } from 'lucide-react';
import { ProviderName, featureNames, FeatureName } from '../../../../common/voidSettingsTypes.js';
import { OllamaSetupInstructions, OneClickSwitchButton, SettingsForProvider, ModelDump } from '../void-settings-tsx/Settings.js';
import { ColorScheme } from '../../../../../../../platform/theme/common/theme.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';

const OVERRIDE_VALUE = false

export const VoidOnboarding = () => {

	const voidSettingsState = useSettingsState()
	const isOnboardingComplete = voidSettingsState.globalSettings.isOnboardingComplete || OVERRIDE_VALUE

	const isDark = useIsDark()

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div
				className={`
					bg-void-bg-3 fixed top-0 right-0 bottom-0 left-0 width-full z-[99999]
					transition-all duration-1000 ${isOnboardingComplete ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}
				`}
				style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
			>
				<ErrorBoundary>
					<VoidOnboardingContent />
				</ErrorBoundary>
			</div>
		</div>
	)
}

const VoidIcon = () => {
	const accessor = useAccessor()
	const themeService = accessor.get('IThemeService')

	const divRef = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		const updateTheme = () => {
			const theme = themeService.getColorTheme().type
			const isDark = theme === ColorScheme.DARK || theme === ColorScheme.HIGH_CONTRAST_DARK
			if (divRef.current) {
				divRef.current.style.maxWidth = '220px'
				divRef.current.style.opacity = '50%'
				divRef.current.style.filter = isDark ? '' : 'invert(1)'
			}
		}
		updateTheme()
		const d = themeService.onDidColorThemeChange(updateTheme)
		return () => d.dispose()
	}, [])

	return <div ref={divRef} className='@@void-void-icon' />
}

const FADE_DURATION_MS = 2000

const FadeIn = ({ children, className, delayMs = 0, durationMs, ...props }: { children: React.ReactNode, delayMs?: number, durationMs?: number, className?: string } & React.HTMLAttributes<HTMLDivElement>) => {

	const [opacity, setOpacity] = useState(0)
	const effectiveDurationMs = durationMs ?? FADE_DURATION_MS

	useEffect(() => {
		const timeout = setTimeout(() => setOpacity(1), delayMs)
		return () => clearTimeout(timeout)
	}, [delayMs])

	return (
		<div className={className} style={{ opacity, transition: `opacity ${effectiveDurationMs}ms ease-in-out` }} {...props}>
			{children}
		</div>
	)
}

const featureNameMap: { display: string, featureName: FeatureName }[] = [
	{ display: 'Chat', featureName: 'Chat' },
	{ display: 'Quick Edit', featureName: 'Ctrl+K' },
	{ display: 'Autocomplete', featureName: 'Autocomplete' },
	{ display: 'Fast Apply', featureName: 'Apply' },
	{ display: 'Source Control', featureName: 'SCM' },
];

const AddProvidersPage = ({ pageIndex, setPageIndex }: { pageIndex: number, setPageIndex: (index: number) => void }) => {
	const settingsState = useSettingsState();

	return (<div className="flex flex-col md:flex-row w-full h-[80vh] gap-6 max-w-[900px] mx-auto relative">
		<div className="md:w-1/4 w-full flex flex-col gap-6 p-6 border-none border-void-border-2 h-full overflow-y-auto">
			<div className="flex flex-col gap-1 mt-4 text-sm opacity-80">
				{featureNameMap.map(({ display, featureName }) => {
					const hasModel = settingsState.modelSelectionOfFeature[featureName] !== null;
					return (
						<div key={featureName} className="flex items-center gap-2">
							{hasModel ? (
								<Check className="w-4 h-4 text-emerald-500" />
							) : (
								<div className="w-3 h-3 rounded-full flex items-center justify-center">
									<div className="w-1 h-1 rounded-full bg-white/70"></div>
								</div>
							)}
							<span>{display}</span>
						</div>
					);
				})}
			</div>
		</div>

		<div className="flex-1 flex flex-col items-center justify-start p-6 h-full overflow-y-auto">
			<div className="text-5xl mb-2 text-center w-full">Connect a local provider</div>
			<div className="text-sm opacity-80 text-void-fg-3 my-4 w-full max-w-xl">
				Forge talks only to locally-hosted model servers. Start Ollama, LM Studio, or vLLM, then configure endpoints below.
			</div>

			<div className="opacity-80 mb-4 w-full max-w-xl">
				<OllamaSetupInstructions sayWeAutoDetect={true} />
			</div>

			<div className="w-full max-w-xl">
				<ModelDump filteredProviders={localProviderNames as ProviderName[]} />
			</div>

			<div className="flex gap-4 mt-8">
				<button
					className="px-6 py-2 rounded-md bg-void-bg-2 hover:bg-void-bg-2/80"
					onClick={() => setPageIndex(pageIndex - 1)}
				>
					Back
				</button>
				<button
					className="px-6 py-2 rounded-md bg-[#0e70c0]/80 text-white font-medium"
					onClick={() => setPageIndex(pageIndex + 1)}
				>
					Continue <ChevronRight className="inline w-4 h-4" />
				</button>
			</div>
		</div>
	</div>);
};

const VoidOnboardingContent = () => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const [pageIndex, setPageIndex] = useState(0)

	const finishOnboarding = () => {
		voidSettingsService.setGlobalSetting('isOnboardingComplete', true)
	}

	if (pageIndex === 0) {
		return (
			<div className="flex flex-col items-center justify-center max-w-[600px] px-8 text-center">
				<VoidIcon />
				<FadeIn delayMs={500}>
					<h1 className="text-5xl font-light mt-8 mb-4">Welcome to Forge</h1>
					<p className="text-void-fg-3 mb-8">A local-first AI IDE. No cloud API keys — every AI feature runs against models on your machine.</p>
					<button
						className="px-8 py-3 rounded-md bg-[#0e70c0]/80 text-white font-medium"
						onClick={() => setPageIndex(1)}
					>
						Get started
					</button>
				</FadeIn>
			</div>
		)
	}

	if (pageIndex === 1) {
		return <AddProvidersPage pageIndex={pageIndex} setPageIndex={setPageIndex} />
	}

	return (
		<div className="flex flex-col items-center justify-center max-w-[600px] px-8 text-center">
			<h1 className="text-4xl font-light mb-4">You're ready</h1>
			<p className="text-void-fg-3 mb-8">Open the sidebar with Cmd+L to chat. Configure models anytime in Forge Settings.</p>
			<button
				className="px-8 py-3 rounded-md bg-[#0e70c0]/80 text-white font-medium"
				onClick={finishOnboarding}
			>
				Open Forge
			</button>
		</div>
	)
}
