import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { mountAgentsWindow } from './react/out/agents-window-tsx/index.js';

export class AgentsWindowContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsWindow';

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		if ((environmentService as any).window?.isAgentsWindow) {
			this.initializeAgentsWindow(layoutService, instantiationService);
		}
	}

	private initializeAgentsWindow(layoutService: IWorkbenchLayoutService, instantiationService: IInstantiationService): void {
		// Wait for the workbench to be restored
		layoutService.whenRestored.then(() => {
			const container = layoutService.mainContainer;
			
			// Create a fullscreen overlay container for the Agents Window
			const agentsWindowContainer = document.createElement('div');
			agentsWindowContainer.style.position = 'absolute';
			agentsWindowContainer.style.inset = '0';
			agentsWindowContainer.style.zIndex = '100000'; // High enough to cover everything
			agentsWindowContainer.style.backgroundColor = 'var(--vscode-editor-background)';
			
			container.appendChild(agentsWindowContainer);

			// Mount the React Agents Window component
			instantiationService.invokeFunction(accessor => {
				const disposeFn = mountAgentsWindow(agentsWindowContainer, accessor)?.dispose;
				this._register(toDisposable(() => disposeFn?.()));
			});
		});
	}
}

registerWorkbenchContribution2(AgentsWindowContribution.ID, AgentsWindowContribution, WorkbenchPhase.AfterRestored);
