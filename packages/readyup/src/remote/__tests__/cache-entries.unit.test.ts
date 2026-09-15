import { statSync } from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { computeHash } from '../../check-utils/hashing.ts';
import { type CacheEntry, readCacheEntry, removeCacheEntry, writeCacheEntry } from '../cache-entries.ts';

const KIT_URL = 'https://raw.githubusercontent.com/acme/kits/main/.readyup/kits/default.js';

const kitEntry: CacheEntry = {
  ageSec: 0,
  body: 'export default {};',
  etag: '"abc"',
  maxAgeSec: 300,
  noCache: false,
  storedAtMs: 1_000,
  url: KIT_URL,
  version: 1,
};

describe(readCacheEntry, () => {
  it('reads back an entry that was written', async () => {
    using tree = createTempTree({}, { prefix: 'readyup-cache-entries-' });

    await writeCacheEntry(tree.dir, kitEntry);

    await expect(readCacheEntry(tree.dir, KIT_URL)).resolves.toStrictEqual(kitEntry);
  });

  it('returns undefined when no entry is stored', async () => {
    using tree = createTempTree({}, { prefix: 'readyup-cache-entries-' });

    await expect(readCacheEntry(tree.dir, KIT_URL)).resolves.toBeUndefined();
  });

  it.each([
    ['contents that are not JSON', '{ not json'],
    ['JSON that is not an entry', JSON.stringify({ url: KIT_URL, body: 'export default {};' })],
    ['an entry stored for another URL', JSON.stringify({ ...kitEntry, url: 'https://example.com/other.js' })],
  ])('returns undefined for %s', async (_label, contents) => {
    using tree = createTempTree({ [`${computeHash(KIT_URL)}.json`]: contents }, { prefix: 'readyup-cache-entries-' });

    await expect(readCacheEntry(tree.dir, KIT_URL)).resolves.toBeUndefined();
  });
});

describe(writeCacheEntry, () => {
  it('replaces an existing entry and leaves no temp file behind', async () => {
    using tree = createTempTree({}, { prefix: 'readyup-cache-entries-' });

    await writeCacheEntry(tree.dir, kitEntry);
    await writeCacheEntry(tree.dir, { ...kitEntry, body: 'export default { checklists: [] };' });

    await expect(readCacheEntry(tree.dir, KIT_URL)).resolves.toHaveProperty(
      'body',
      'export default { checklists: [] };',
    );
    expect(tree.listFiles()).toStrictEqual([`${computeHash(KIT_URL)}.json`]);
  });

  it('creates the cache directory where it does not exist', async () => {
    using tree = createTempTree({}, { prefix: 'readyup-cache-entries-' });
    const cacheDir = tree.resolve('readyup/http');

    await writeCacheEntry(cacheDir, kitEntry);

    await expect(readCacheEntry(cacheDir, KIT_URL)).resolves.toStrictEqual(kitEntry);
    expect(statSync(cacheDir).mode & 0o777).toBe(0o700);
  });

  it('stores nothing, without throwing, when the cache directory cannot be created', async () => {
    using tree = createTempTree({ blocker: '' }, { prefix: 'readyup-cache-entries-' });
    const cacheDir = tree.resolve('blocker/http');

    await expect(writeCacheEntry(cacheDir, kitEntry)).resolves.toBeUndefined();
    expect(tree.listFiles()).toStrictEqual(['blocker']);
  });
});

describe(removeCacheEntry, () => {
  it('removes a stored entry', async () => {
    using tree = createTempTree({}, { prefix: 'readyup-cache-entries-' });
    await writeCacheEntry(tree.dir, kitEntry);

    await removeCacheEntry(tree.dir, KIT_URL);

    await expect(readCacheEntry(tree.dir, KIT_URL)).resolves.toBeUndefined();
  });

  it('does nothing when no entry is stored', async () => {
    using tree = createTempTree({}, { prefix: 'readyup-cache-entries-' });

    await expect(removeCacheEntry(tree.dir, KIT_URL)).resolves.toBeUndefined();
  });
});
