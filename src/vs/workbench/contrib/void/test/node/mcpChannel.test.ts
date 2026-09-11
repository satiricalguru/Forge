import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MCPChannel } from '../../electron-main/mcpChannel.js';

suite('MCPChannel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disabled servers stay offline without creating a transport', async () => {
		const channel = store.add(new MCPChannel());
		let connected = false;
		(channel as any)._createClientUnsafe = async () => {
			connected = true;
			throw new Error('should not connect');
		};

		const info = await (channel as any)._createClient({ command: 'test-server' }, 'test', false);

		assert.strictEqual(connected, false);
		assert.strictEqual(info._client, undefined);
		assert.strictEqual(info.mcpServer.status, 'offline');
		assert.deepStrictEqual(info.mcpServer.tools, []);
	});

	test('toggle off replaces stale tools with an offline server', async () => {
		const channel = store.add(new MCPChannel());
		const info = (channel as any).infoOfClientId;
		info.test = {
			mcpServerEntryJSON: { command: 'test-server' },
			mcpServer: { status: 'success', tools: [{ name: 'stale' }], command: 'test-server' },
			_client: { close: async () => {} },
		};

		await (channel as any)._toggleMCPServer('test', false);

		assert.strictEqual(info.test._client, undefined);
		assert.strictEqual(info.test.mcpServer.status, 'offline');
		assert.deepStrictEqual(info.test.mcpServer.tools, []);
	});
});
