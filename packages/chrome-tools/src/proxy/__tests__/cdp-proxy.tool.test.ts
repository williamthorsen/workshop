import { once } from 'node:events';

import { afterAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { openBackgroundPage } from '../../portable/open-background-page.ts';
import { startHeadlessChrome } from '../../test-utils/headless-chrome.ts';
import { type CdpProxy, startCdpProxy } from '../cdp-proxy.ts';
import { rawDataToString } from '../raw-data.ts';

// Start the browser and its proxy once at collection, so that the skip is decided before any case runs
const browser = await startHeadlessChrome();
const proxy: CdpProxy | undefined =
  browser === undefined ? undefined : await startCdpProxy({ listenPort: '0', upstreamPort: browser.port });

describe(startCdpProxy, () => {
  afterAll(async () => {
    await proxy?.close();
    await browser?.stop();
  });

  it.skipIf(proxy === undefined)('names the advertised port in the real /json/version and /json/list', async () => {
    const port = proxy?.port ?? '';
    // A browser started without a window lists no target until a page opens
    await openBackgroundPage(browser?.port ?? '', 'about:blank');
    for (const path of ['/json/version', '/json/list']) {
      const body = await (await fetch(`http://127.0.0.1:${port}${path}`)).text();
      expect(body).toContain(`127.0.0.1:${port}/devtools/`);
      expect(body).not.toContain(`:${browser?.port ?? ''}/`);
    }
  });

  it.skipIf(proxy === undefined)('creates a target from Target.createTarget sent without background', async () => {
    const version: unknown = await (await fetch(`http://127.0.0.1:${proxy?.port ?? ''}/json/version`)).json();
    const socketUrl = readString(version, 'webSocketDebuggerUrl');
    const socket = new WebSocket(socketUrl);
    await once(socket, 'open');
    const reply = new Promise<string>((resolve) => {
      socket.once('message', (data) => {
        resolve(rawDataToString(data));
      });
    });
    socket.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'data:text/html,cdp' } }));
    const targetId = readString(readRecord(JSON.parse(await reply), 'result'), 'targetId');
    socket.close();
    await expect(listPageIds(proxy?.port ?? '')).resolves.toContain(targetId);
  });

  it.skipIf(proxy === undefined)('opens /json/new and answers with its /json/list entry', async () => {
    const port = proxy?.port ?? '';
    const response = await fetch(`http://127.0.0.1:${port}/json/new?data:text/html,json-new`, { method: 'PUT' });
    const entry: unknown = await response.json();
    expect(entry).toMatchObject({ type: 'page', url: 'data:text/html,json-new' });
    expect(readString(entry, 'webSocketDebuggerUrl')).toContain(`127.0.0.1:${port}/devtools/page/`);
    await expect(listPageIds(port)).resolves.toContain(readString(entry, 'id'));
  });
});

// region | Helpers

/** Returns the IDs of the browser's page targets, as `/json/list` reports them through the proxy. */
async function listPageIds(port: string): Promise<string[]> {
  const targets: unknown = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  if (!Array.isArray(targets)) return [];
  return targets.filter((target) => readString(target, 'type') === 'page').map((target) => readString(target, 'id'));
}

/** Returns an object property of a value that the test expects to be an object. */
function readRecord(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) throw new Error(`not an object: ${String(value)}`);
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

/** Returns a string property of a value, or an empty string when it has none. */
function readString(value: unknown, key: string): string {
  const property = readRecord(value, key);
  return typeof property === 'string' ? property : '';
}

// endregion | Helpers
