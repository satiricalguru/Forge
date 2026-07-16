import React from 'react';
import { X, Settings as SettingsIcon, Eye, EyeOff, Plug } from 'lucide-react';
import { useSettingsState, useRefreshModelState, useAccessor } from '../util/services.js';
import { localProviderNames, displayInfoOfProviderName, ProviderName } from '../../../../../../../workbench/contrib/void/common/voidSettingsTypes.js';
import { getModelCapabilities } from '../../../../../../../workbench/contrib/void/common/modelCapabilities.js';
import { VOID_OPEN_SETTINGS_ACTION_ID } from '../../../voidSettingsPane.js';

export const ModelCapabilitiesModal = ({ onClose }: { onClose: () => void }) => {
	const settingsState = useSettingsState();
	const refreshModelState = useRefreshModelState();
	const accessor = useAccessor();
	const commandService = accessor.get('ICommandService');

	return (
		<div 
			className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center p-4"
			onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
		>
			<div className="bg-void-bg-1 border border-void-border-3 rounded-md shadow-xl w-full max-w-3xl flex flex-col max-h-[80vh]">
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-void-border-3">
					<h2 className="text-lg font-medium text-void-fg-1">Local Models Overview</h2>
					<button onClick={onClose} className="p-1 hover:bg-void-bg-2 rounded-md">
						<X className="w-5 h-5 text-void-fg-3" />
					</button>
				</div>
				
				{/* Body */}
				<div className="p-4 overflow-y-auto flex flex-col gap-6">
					{localProviderNames.map(providerName => {
						const state = (refreshModelState as any)[providerName]?.state;
						const models = settingsState.settingsOfProvider[providerName]?.models || [];
						const providerInfo = displayInfoOfProviderName(providerName);

						// Only show if the user has added models or if it's currently fetching/failed
						if (models.length === 0 && state !== 'error' && state !== 'refreshing') return null;
						
						return (
							<div key={providerName} className="flex flex-col border border-void-border-3 rounded-md overflow-hidden">
								{/* Provider Header */}
								<div className="bg-void-bg-2 p-3 flex items-center justify-between border-b border-void-border-3">
									<div className="flex items-center gap-2">
										<Eye className="w-4 h-4 text-void-fg-3" />
										<span className="font-medium text-void-fg-1">{providerInfo.title}</span>
									</div>
									<div 
										title="Open Settings"
										className="cursor-pointer flex items-center justify-center"
										onClick={() => {
											onClose();
											commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID);
										}}
									>
										<SettingsIcon className="w-4 h-4 text-void-fg-3 hover:text-void-fg-1" />
									</div>
								</div>
								
								{/* Models List */}
								<div className="flex flex-col bg-void-bg-1">
									{state === 'error' && (
										<div className="p-3 text-red-500 text-sm flex items-center gap-2">
											<span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-red-500 text-[10px]">✕</span>
											fetch failed
										</div>
									)}
									
									{models.length > 0 && models.map((model, i) => {
										const refreshStateModels = (refreshModelState as any)[providerName]?.models;
										const rawModel = refreshStateModels?.find((m: any) => (m.name || m.id) === model.modelName) as any;
										
										const capabilities = getModelCapabilities(providerName, model.modelName, undefined);
										const realtimeContext = providerName === 'ollama' ? rawModel?.details?.context_length : (rawModel?.context_length ?? rawModel?.context_window);
										const contextWindow = realtimeContext ?? capabilities?.contextWindow;
										const contextSize = contextWindow ? `${Math.round(contextWindow / 1000)}K` : 'Unknown';
										
										return (
											<div key={model.modelName} className={`flex items-center justify-between p-3 ${i !== models.length - 1 ? 'border-b border-void-border-3' : ''}`}>
												<div className="flex items-center gap-2 flex-1">
													{model.isHidden ? <EyeOff className="w-4 h-4 text-void-fg-4" /> : <Eye className="w-4 h-4 text-void-fg-3" />}
													<span className="text-void-fg-2 font-medium">{model.modelName}</span>
												</div>
												<div className="flex items-center gap-4">
													<div className="text-xs text-void-fg-3 border border-void-border-3 rounded-md px-2 py-1 bg-void-bg-2">
														Context Size: {contextSize}
													</div>
													{/* Tool tags */}
													<div className="flex gap-2">
														<span className="text-[10px] uppercase border border-void-border-3 text-void-fg-3 px-1.5 py-0.5 rounded bg-void-bg-1">Tools</span>
														<span className="text-[10px] uppercase border border-void-border-3 text-void-fg-3 px-1.5 py-0.5 rounded bg-void-bg-1">Vision</span>
													</div>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};
