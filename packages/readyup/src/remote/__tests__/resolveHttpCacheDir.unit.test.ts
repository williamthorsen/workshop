import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { resolveHttpCacheDir } from '../resolveHttpCacheDir.ts';

describe(resolveHttpCacheDir, () => {
  it('places the cache under an absolute XDG_CACHE_HOME', () => {
    const cacheHome = path.resolve('/var/cache-home');
    vi.stubEnv('XDG_CACHE_HOME', cacheHome);

    expect(resolveHttpCacheDir()).toBe(path.join(cacheHome, 'readyup', 'http'));
  });

  it.each([
    ['unset', undefined],
    ['relative', 'relative/cache'],
    ['empty', ''],
  ])('places the cache under the home directory when XDG_CACHE_HOME is %s', (_label, cacheHome) => {
    const homeDir = path.resolve('/home/reader');
    vi.stubEnv('XDG_CACHE_HOME', cacheHome);
    vi.stubEnv('HOME', homeDir);

    expect(resolveHttpCacheDir()).toBe(path.join(homeDir, '.cache', 'readyup', 'http'));
  });

  it('returns undefined when no absolute home can be resolved', () => {
    vi.stubEnv('XDG_CACHE_HOME', undefined);
    vi.stubEnv('HOME', undefined);
    vi.stubEnv('USERPROFILE', undefined);

    expect(resolveHttpCacheDir()).toBeUndefined();
  });
});
