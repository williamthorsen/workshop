import assert from 'node:assert';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fetchWithCache } from '../fetchWithCache.ts';

const TIMEOUT_MS = 100;

const STALLS = [
  ['before the response headers', '/stall-headers'],
  ['partway through the body', '/stall-body'],
];

describe(fetchWithCache, () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer((request, response) => {
      if (request.url !== '/stall-body') {
        return;
      }

      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.write('export default');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    assert.ok(address !== null && typeof address === 'object');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  });

  describe('without a cache', () => {
    it.each(STALLS)('rejects a request that stalls %s, naming the URL and the limit', async (_label, path) => {
      const url = `${baseUrl}${path}`;

      await expect(
        fetchWithCache(url, { cache: undefined, resolveHeaders: () => undefined, timeoutMs: TIMEOUT_MS }),
      ).rejects.toThrow(`Timed out after 0.1s fetching ${url}`);
    });
  });

  describe('with a cache', () => {
    it.each(STALLS)('rejects a request that stalls %s, naming the URL and the limit', async (_label, path) => {
      using tree = createTempTree({}, { prefix: 'readyup-http-cache-' });
      const url = `${baseUrl}${path}`;

      await expect(
        fetchWithCache(url, {
          cache: { dir: tree.dir, reload: false },
          resolveHeaders: () => undefined,
          timeoutMs: TIMEOUT_MS,
        }),
      ).rejects.toThrow(`Timed out after 0.1s fetching ${url}`);
    });
  });
});
