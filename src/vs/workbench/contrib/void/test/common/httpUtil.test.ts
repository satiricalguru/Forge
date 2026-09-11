import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { assertLocalUrl } from '../../common/forge/httpUtil.js';

suite('Forge local HTTP policy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts IPv6 loopback URLs', () => {
		assert.doesNotThrow(() => assertLocalUrl('http://[::1]:11434/api/tags'));
	});

	test('rejects public endpoints', () => {
		assert.throws(() => assertLocalUrl('https://example.com/api'), /Refusing non-local URL/);
	});
});
