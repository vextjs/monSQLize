import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('P2-C management-core support helpers', () => {
    it('MemoryCache supports keys/delPattern wildcard features required by bookmarks', () => {
        const cache = new MonSQLize.MemoryCache();

        cache.set('bookmark:db:users:{"limit":1}:page:1', { page: 1 });
        cache.set('bookmark:db:users:{"limit":1}:page:2', { page: 2 });
        cache.set('bookmark:db:orders:{"limit":1}:page:1', { page: 1 });
        cache.set('other:key', true);

        const userBookmarkKeys = cache.keys('bookmark:db:users:*:page:*').sort();
        assert.deepEqual(userBookmarkKeys, [
            'bookmark:db:users:{"limit":1}:page:1',
            'bookmark:db:users:{"limit":1}:page:2',
        ]);

        const cleared = cache.delPattern('bookmark:db:users:*:page:*');
        assert.equal(cleared, 2);
        assert.deepEqual(cache.keys('bookmark:db:users:*:page:*'), []);
        assert.deepEqual(cache.keys('*').sort(), ['bookmark:db:orders:{"limit":1}:page:1', 'other:key']);
    });
});