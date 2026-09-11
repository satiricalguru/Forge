import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionRegistryMainService } from '../../electron-main/sessionRegistryMainService.js';

suite('SessionRegistryMainService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let tempRoot: string;
	let service: SessionRegistryMainService;

	setup(async () => {
		tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forge-session-registry-'));
		service = store.add(new SessionRegistryMainService(path.join(tempRoot, 'sessions')));
	});

	teardown(async () => {
		await fs.promises.rm(tempRoot, { recursive: true, force: true });
	});

	test('update cannot change persistence identity or escape the sessions directory', async () => {
		const original = await service.create({
			workspacePath: '/workspace',
			providerId: 'local',
			modelId: 'model',
			chatThreadId: 'session-1',
		});

		await service.update(original.id, {
			id: '../../escape',
			workspacePath: '/outside',
			chatThreadId: '../../escape',
			title: 'Updated',
		} as any);

		const updated = await service.get(original.id);
		assert.strictEqual(updated?.id, original.id);
		assert.strictEqual(updated?.chatThreadId, original.chatThreadId);
		assert.strictEqual(updated?.workspacePath, original.workspacePath);
		assert.strictEqual(updated?.title, 'Updated');
		assert.strictEqual(fs.existsSync(path.join(tempRoot, 'escape.json')), false);
	});
});
