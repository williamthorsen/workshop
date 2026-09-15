import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

import { readCacheEntry } from '../cache-entries.ts';
import { fetchWithCache, type HttpCacheSettings } from '../fetchWithCache.ts';

const KIT_URL = 'https://raw.githubusercontent.com/acme/kits/main/.readyup/kits/default.js';
const KIT_BODY = 'export default {};';
const START_MS = Date.UTC(2_026, 8, 13, 12, 0, 0);

describe(fetchWithCache, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
    mockFetch.mockReset();
  });

  describe('without a cache', () => {
    it('fetches with the resolved headers', async () => {
      mockFetch.mockResolvedValue(new Response(KIT_BODY));

      await fetchWithCache(KIT_URL, { cache: undefined, resolveHeaders: () => ({ Authorization: 'token abc' }) });

      expect(mockFetch).toHaveBeenCalledWith(KIT_URL, {
        headers: { Authorization: 'token abc' },
        signal: expect.any(AbortSignal),
      });
    });

    it('fetches with empty headers when none are resolved', async () => {
      mockFetch.mockResolvedValue(new Response(KIT_BODY));

      await fetchWithCache(KIT_URL, { cache: undefined, resolveHeaders: () => undefined });

      expect(mockFetch).toHaveBeenCalledWith(KIT_URL, { headers: {}, signal: expect.any(AbortSignal) });
    });

    it('returns a response whose status allows no body', async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      const response = await fetchWithCache(KIT_URL, { cache: undefined, resolveHeaders: () => undefined });

      expect(response.status).toBe(204);
    });
  });

  it('serves a fresh entry without sending a request or resolving headers', async () => {
    using tree = createCacheTree();
    const cache = buildCache(tree);
    mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
    await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

    vi.setSystemTime(START_MS + 299_000);
    const resolveHeaders = vi.fn(() => ({ Authorization: 'token abc' }));
    const response = await fetchWithCache(KIT_URL, { cache, resolveHeaders });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(resolveHeaders).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(KIT_BODY);
  });

  it('counts the Age header against freshness', async () => {
    using tree = createCacheTree();
    const cache = buildCache(tree);
    mockFetch.mockImplementation(() => buildKitResponse({ 'Cache-Control': 'max-age=300', Age: '200' }));
    await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

    vi.setSystemTime(START_MS + 100_000);
    await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('treats an entry stored later than the clock now reads as stale', async () => {
    using tree = createCacheTree();
    const cache = buildCache(tree);
    mockFetch.mockImplementation(() => buildKitResponse({ 'Cache-Control': 'max-age=300' }));
    await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

    vi.setSystemTime(START_MS - 60_000);
    await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  describe('once an entry is stale', () => {
    it('revalidates with If-None-Match and serves the stored body on a 304', async () => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      vi.setSystemTime(START_MS + 300_000);
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 304 }));
      const response = await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => ({ Authorization: 'token abc' }) });

      expect(mockFetch).toHaveBeenLastCalledWith(KIT_URL, {
        headers: { Authorization: 'token abc', 'If-None-Match': '"v1"' },
        signal: expect.any(AbortSignal),
      });
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe(KIT_BODY);
    });

    it('revalidates with If-Modified-Since when the entry has no ETag', async () => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      const lastModified = 'Sat, 12 Sep 2026 08:00:00 GMT';
      mockFetch.mockResolvedValueOnce(
        buildKitResponse({ 'Cache-Control': 'max-age=0', 'Last-Modified': lastModified }),
      );
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      mockFetch.mockResolvedValueOnce(new Response(null, { status: 304 }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      expect(mockFetch).toHaveBeenLastCalledWith(KIT_URL, {
        headers: { 'If-Modified-Since': lastModified },
        signal: expect.any(AbortSignal),
      });
    });

    it('restarts freshness from the 304, taking the values that it sends', async () => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      vi.setSystemTime(START_MS + 300_000);
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 304, headers: { 'Cache-Control': 'max-age=600' } }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      vi.setSystemTime(START_MS + 300_000 + 599_000);
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      await expect(readCacheEntry(cache.dir, KIT_URL)).resolves.toMatchObject({ etag: '"v1"', maxAgeSec: 600 });
    });

    it('replaces the entry when the server returns a new body', async () => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      vi.setSystemTime(START_MS + 300_000);
      const updatedBody = 'export default { checklists: [] };';
      mockFetch.mockResolvedValueOnce(
        new Response(updatedBody, { headers: { 'Cache-Control': 'max-age=300', ETag: '"v2"' } }),
      );
      const response = await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      await expect(response.text()).resolves.toBe(updatedBody);
      await expect(readCacheEntry(cache.dir, KIT_URL)).resolves.toMatchObject({ body: updatedBody, etag: '"v2"' });
    });

    it('propagates a transport failure rather than serving the stored body', async () => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      vi.setSystemTime(START_MS + 300_000);
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined })).rejects.toThrow('fetch failed');
    });

    it('returns a failing status unchanged and keeps the entry', async () => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      vi.setSystemTime(START_MS + 300_000);
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404, statusText: 'Not Found' }));
      const response = await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      expect(response.status).toBe(404);
      expect(response.statusText).toBe('Not Found');
      await expect(readCacheEntry(cache.dir, KIT_URL)).resolves.toHaveProperty('body', KIT_BODY);
    });
  });

  it('revalidates an entry marked no-cache on every use', async () => {
    using tree = createCacheTree();
    const cache = buildCache(tree);
    mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'no-cache, max-age=300', ETag: '"v1"' }));
    await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

    mockFetch.mockResolvedValue(new Response(null, { status: 304 }));
    await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });
    await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenLastCalledWith(KIT_URL, {
      headers: { 'If-None-Match': '"v1"' },
      signal: expect.any(AbortSignal),
    });
  });

  describe('storage', () => {
    it.each([
      ['a response marked no-store', { 'Cache-Control': 'no-store, max-age=300', ETag: '"v1"' }],
      ['a response with neither a positive max-age nor a validator', { 'Cache-Control': 'max-age=0' }],
    ])('does not store %s', async (_label, headers) => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      mockFetch.mockResolvedValue(buildKitResponse(headers));

      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      await expect(readCacheEntry(cache.dir, KIT_URL)).resolves.toBeUndefined();
    });

    it('does not store a response to a failed request', async () => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      mockFetch.mockResolvedValue(
        new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'max-age=300' } }),
      );

      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      await expect(readCacheEntry(cache.dir, KIT_URL)).resolves.toBeUndefined();
    });

    it('removes an existing entry when the response replacing it may not be stored', async () => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      vi.setSystemTime(START_MS + 300_000);
      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'no-store' }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      await expect(readCacheEntry(cache.dir, KIT_URL)).resolves.toBeUndefined();
    });

    it('bypasses the cache for a URL that is not HTTP', async () => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      mockFetch.mockResolvedValue(buildKitResponse({ 'Cache-Control': 'max-age=300' }));

      await fetchWithCache('file:///kits/default.js', { cache, resolveHeaders: () => undefined });

      expect(tree.listFiles()).toStrictEqual([]);
    });

    it('returns the response when the cache cannot be written', async () => {
      using tree = createCacheTree({ blocker: '' });
      const cache: HttpCacheSettings = { dir: tree.resolve('blocker/http'), reload: false };
      mockFetch.mockResolvedValue(buildKitResponse({ 'Cache-Control': 'max-age=300' }));

      const response = await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe(KIT_BODY);
    });

    it('fetches unconditionally when the stored entry cannot be read', async () => {
      using tree = createCacheTree();
      const cache = buildCache(tree);
      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });
      const [entryFile = ''] = tree.listFiles();
      tree.write(entryFile, '{ truncated');

      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
      await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

      expect(mockFetch).toHaveBeenLastCalledWith(KIT_URL, { headers: {}, signal: expect.any(AbortSignal) });
      await expect(readCacheEntry(cache.dir, KIT_URL)).resolves.toHaveProperty('body', KIT_BODY);
    });
  });

  it('keeps the status, status text, headers, and body of a response that it stores', async () => {
    using tree = createCacheTree();
    const cache = buildCache(tree);
    mockFetch.mockResolvedValue(buildKitResponse({ 'Cache-Control': 'max-age=300', 'X-Kit': 'default' }));

    const response = await fetchWithCache(KIT_URL, { cache, resolveHeaders: () => undefined });

    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');
    expect(response.headers.get('X-Kit')).toBe('default');
    await expect(response.text()).resolves.toBe(KIT_BODY);
  });

  describe('when reloading', () => {
    it('fetches unconditionally even while an entry is fresh', async () => {
      using tree = createCacheTree();
      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
      await fetchWithCache(KIT_URL, { cache: buildCache(tree), resolveHeaders: () => undefined });

      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300', ETag: '"v1"' }));
      await fetchWithCache(KIT_URL, { cache: buildCache(tree, { reload: true }), resolveHeaders: () => undefined });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(KIT_URL, { headers: {}, signal: expect.any(AbortSignal) });
    });

    it('stores the response that it fetches', async () => {
      using tree = createCacheTree();
      mockFetch.mockResolvedValueOnce(buildKitResponse({ 'Cache-Control': 'max-age=300' }));
      await fetchWithCache(KIT_URL, { cache: buildCache(tree, { reload: true }), resolveHeaders: () => undefined });

      await fetchWithCache(KIT_URL, { cache: buildCache(tree), resolveHeaders: () => undefined });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

// region | Helpers

/** Returns cache settings rooted in a temp tree. */
function buildCache(tree: TempTree, { reload = false }: { reload?: boolean } = {}): HttpCacheSettings {
  return { dir: tree.dir, reload };
}

/** Returns a successful kit response carrying the given headers. */
function buildKitResponse(headers: Record<string, string>): Response {
  return new Response(KIT_BODY, { status: 200, statusText: 'OK', headers });
}

/** Creates a temp tree to hold a cache. */
function createCacheTree(entries: Record<string, string> = {}): TempTree {
  return createTempTree(entries, { prefix: 'readyup-http-cache-' });
}

// endregion | Helpers
