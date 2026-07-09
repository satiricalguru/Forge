import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resolveForgeProvider, bindForgeProviderEndpoint } from '../../common/forge/forgeProviderResolve.js';
import { ILocalProvider } from '../../common/forgeProviderTypes.js';
import { ProviderName, SettingsOfProvider } from '../../common/voidSettingsTypes.js';

suite('forgeProviderResolve', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const emptySettings = {
		ollama: {},
		vLLM: {},
		lmStudio: {},
		openAICompatible: { endpoint: 'http://custom:8080', apiKey: '', headersJSON: '' },
	} as any as SettingsOfProvider;

	test('resolves ollama provider', () => {
		const provider = resolveForgeProvider('ollama', emptySettings);
		assert.ok(provider);
		assert.strictEqual(provider.id, 'ollama');
		assert.strictEqual(provider.displayName, 'Ollama');
	});

	test('resolves lmStudio provider', () => {
		const provider = resolveForgeProvider('lmStudio', emptySettings);
		assert.ok(provider);
		assert.strictEqual(provider.id, 'lmstudio');
		assert.strictEqual(provider.displayName, 'LM Studio');
	});

	test('resolves vLLM provider', () => {
		const provider = resolveForgeProvider('vLLM', emptySettings);
		assert.ok(provider);
		assert.strictEqual(provider.id, 'vllm');
	});

	test('resolves openAICompatible provider', () => {
		const provider = resolveForgeProvider('openAICompatible', emptySettings);
		assert.ok(provider);
		assert.strictEqual(provider.id, 'openaicompatible');
	});

	test('returns undefined for unknown provider name', () => {
		const provider = resolveForgeProvider('unknown' as ProviderName, emptySettings);
		assert.strictEqual(provider, undefined);
	});

	test('bindForgeProviderEndpoint does not mutate original when it clones', () => {
		const provider = resolveForgeProvider('ollama', emptySettings);
		assert.ok(provider);

		const bound = bindForgeProviderEndpoint(provider, 'http://override:8080');
		if (bound !== provider) {
			assert.strictEqual(provider.resolveEndpoint(undefined), 'http://127.0.0.1:11434');
		}
	});

	test('bindForgeProviderEndpoint returns same provider if not BaseHttpProvider', () => {
		const simpleProvider: ILocalProvider = {
			id: 'test',
			displayName: 'Test',
			defaultEndpoint: 'http://test:8080',
			isAutoDiscoverable: false,
			resolveEndpoint: (override?: string) => override ?? 'http://test:8080',
			healthcheck: async () => ({ status: 'unknown' }),
			listModels: async () => ({ models: [] }),
			streamChat: async () => ({ cancel: () => {}, finished: Promise.resolve() }),
			capabilitiesFor: () => ({ supportsTools: false, supportsFIM: false, supportsReasoning: false, supportsVision: false, supportsSystemMessage: true, contextWindow: null, reservedOutputTokens: null }),
		};

		const bound = bindForgeProviderEndpoint(simpleProvider, 'http://override:8080');
		assert.strictEqual(bound, simpleProvider);
	});
});
