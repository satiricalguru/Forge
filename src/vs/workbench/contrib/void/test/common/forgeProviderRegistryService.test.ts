import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILocalProvider, ILocalProviderRegistry, ILocalProviderRegistryService, ProviderHealth } from '../../common/forgeProviderTypes.js';
import { LocalProviderRegistryService } from '../../common/forgeProviderRegistryService.js';
import { IVoidSettingsService } from '../../common/voidSettingsService.js';

suite('LocalProviderRegistryService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let registryService: ILocalProviderRegistryService;
	const healthResultsOfProviderId = new Map<string, ProviderHealth>();

	const mockProviderA: ILocalProvider = {
		id: 'provider-a',
		displayName: 'Provider A',
		defaultEndpoint: 'http://localhost:8080',
		isAutoDiscoverable: true,
		resolveEndpoint: (override?: string) => override ?? 'http://localhost:8080',
		healthcheck: async (token: CancellationToken) => healthResultsOfProviderId.get('provider-a') ?? { status: 'healthy', latencyMs: 5, models: 3 },
		listModels: async (token: CancellationToken) => ({ models: [] }),
		streamChat: async () => ({ cancel: () => {}, finished: Promise.resolve() }),
		capabilitiesFor: () => ({ supportsTools: false, supportsFIM: false, supportsReasoning: false, supportsVision: false, supportsSystemMessage: true, contextWindow: null, reservedOutputTokens: null }),
	};

	const mockProviderB: ILocalProvider = {
		id: 'provider-b',
		displayName: 'Provider B',
		defaultEndpoint: 'http://localhost:9090',
		isAutoDiscoverable: true,
		resolveEndpoint: (override?: string) => override ?? 'http://localhost:9090',
		healthcheck: async (token: CancellationToken) => healthResultsOfProviderId.get('provider-b') ?? { status: 'unhealthy', error: 'connection refused', latencyMs: 100 },
		listModels: async (token: CancellationToken) => ({ models: [] }),
		streamChat: async () => ({ cancel: () => {}, finished: Promise.resolve() }),
		capabilitiesFor: () => ({ supportsTools: false, supportsFIM: false, supportsReasoning: false, supportsVision: false, supportsSystemMessage: true, contextWindow: null, reservedOutputTokens: null }),
	};

	const mockProviders: ILocalProvider[] = [mockProviderA, mockProviderB];

	const mockRegistry: ILocalProviderRegistry = {
		_serviceBrand: undefined,
		providers: new Map(mockProviders.map(p => [p.id, p])),
		get: (id: string) => mockProviders.find(p => p.id === id),
		all: () => mockProviders,
		autoDiscoverable: () => mockProviders.filter(p => p.isAutoDiscoverable),
		register: (provider: ILocalProvider) => { mockProviders.push(provider); return { dispose: () => {} }; },
	};

	setup(() => {
		healthResultsOfProviderId.clear();
		healthResultsOfProviderId.set('provider-a', { status: 'healthy', latencyMs: 5, models: 3 });
		healthResultsOfProviderId.set('provider-b', { status: 'unhealthy', error: 'connection refused', latencyMs: 100 });

		instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[ILocalProviderRegistry, mockRegistry],
			[IVoidSettingsService, {
				_serviceBrand: undefined,
				state: { settingsOfProvider: {} as any },
				waitForInitState: Promise.resolve(),
				onDidChangeState: Event.None,
			} as any],
		)));

		registryService = store.add(instantiationService.createInstance(LocalProviderRegistryService));
	});

	test('initial health is unknown for all providers', () => {
		const healthA = registryService.getHealth('provider-a');
		assert.strictEqual(healthA.status, 'unknown');

		const healthB = registryService.getHealth('provider-b');
		assert.strictEqual(healthB.status, 'unknown');
	});

	test('forceCheck transitions health to checking then healthy', async () => {
		const healthEvents: { providerId: string; health: ProviderHealth }[] = [];
		store.add(registryService.onDidChangeHealth(e => healthEvents.push(e)));

		const result = await registryService.forceCheck('provider-a');

		assert.strictEqual(result.status, 'healthy');
		if (result.status === 'healthy') {
			assert.strictEqual(result.models, 3);
			assert.ok(result.latencyMs >= 0);
		}

		const getHealth = registryService.getHealth('provider-a');
		assert.strictEqual(getHealth.status, 'healthy');

		assert.ok(healthEvents.length >= 2);
		assert.strictEqual(healthEvents[0].health.status, 'checking');
		assert.strictEqual(healthEvents[1].health.status, 'healthy');
	});

	test('forceCheck returns unhealthy when provider fails', async () => {
		healthResultsOfProviderId.set('provider-a', { status: 'unhealthy', error: 'timeout', latencyMs: 2000 });

		const result = await registryService.forceCheck('provider-a');

		assert.strictEqual(result.status, 'unhealthy');
		if (result.status === 'unhealthy') {
			assert.strictEqual(result.error, 'timeout');
		}
	});

	test('forceCheck on unknown provider returns unknown', async () => {
		const result = await registryService.forceCheck('nonexistent');
		assert.strictEqual(result.status, 'unknown');
	});

	test('forceCheck resets backoff for unhealthy provider', async () => {
		healthResultsOfProviderId.set('provider-b', { status: 'unhealthy', error: 'refused', latencyMs: 100 });
		await registryService.forceCheck('provider-b');

		let healthB = registryService.getHealth('provider-b');
		assert.strictEqual(healthB.status, 'unhealthy');

		healthResultsOfProviderId.set('provider-b', { status: 'healthy', latencyMs: 5, models: 2 });
		const result = await registryService.forceCheck('provider-b');

		assert.strictEqual(result.status, 'healthy');
		if (result.status === 'healthy') {
			assert.strictEqual(result.models, 2);
		}
	});

	test('forceCheck does not throw when healthcheck throws', async () => {
		const throwingProvider: ILocalProvider = {
			...mockProviderA,
			id: 'throwing-provider',
			healthcheck: async () => { throw new Error('unexpected error'); },
		};
		mockRegistry.all = () => [...mockProviders, throwingProvider];
		mockRegistry.get = (id: string) => [...mockProviders, throwingProvider].find(p => p.id === id);

		const result = await registryService.forceCheck('throwing-provider');
		assert.strictEqual(result.status, 'unhealthy');
		if (result.status === 'unhealthy') {
			assert.ok(result.error.includes('unexpected error'));
		}
	});

	test('getAllHealth returns map of all provider health entries', () => {
		const allHealth = registryService.getAllHealth();
		assert.ok(allHealth instanceof Map);
		assert.strictEqual(allHealth.get('provider-a')?.status, 'unknown');
		assert.strictEqual(allHealth.get('provider-b')?.status, 'unknown');
	});

	test('onDidChangeHealth fires for each health update', async () => {
		const events: { providerId: string; health: ProviderHealth }[] = [];
		store.add(registryService.onDidChangeHealth(e => events.push(e)));

		await registryService.forceCheck('provider-a');

		assert.ok(events.length >= 2);
		assert.strictEqual(events[0].providerId, 'provider-a');
		assert.strictEqual(events[0].health.status, 'checking');
		assert.strictEqual(events[1].providerId, 'provider-a');
		assert.strictEqual(events[1].health.status, 'healthy');
	});
});
