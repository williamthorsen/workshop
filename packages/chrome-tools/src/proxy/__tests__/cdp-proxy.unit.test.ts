import { once } from 'node:events';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type RawData, WebSocket } from 'ws';

import { type CdpProxy, startCdpProxy } from '../cdp-proxy.ts';
import { rawDataToString } from '../raw-data.ts';
import { type FakeUpstream, REFUSED_SOCKET_PATH, startFakeUpstream } from '../test-utils/fake-upstream.ts';

describe(startCdpProxy, () => {
  let upstream: FakeUpstream;
  let proxy: CdpProxy;

  beforeEach(async () => {
    upstream = await startFakeUpstream();
    proxy = await startCdpProxy({ listenPort: '0', upstreamPort: upstream.port });
  });

  afterEach(async () => {
    await proxy.close();
    await upstream.close();
  });

  describe('WebSocket relay', () => {
    it.each(['Target.activateTarget', 'Page.bringToFront'])(
      'answers %s with success and never forwards it',
      async (method) => {
        const client = await connect(proxy, '/devtools/page/T1');
        client.socket.send(JSON.stringify({ id: 1, method, params: { targetId: 'T1' }, sessionId: 'S' }));
        await expect(client.next()).resolves.toStrictEqual({
          data: JSON.stringify({ id: 1, result: {}, sessionId: 'S' }),
          isBinary: false,
        });
        // A command sent afterwards arrives first upstream, which shows that the suppressed one was never forwarded
        client.socket.send(JSON.stringify({ id: 2, method: 'Browser.getVersion' }));
        await client.next();
        expect(upstream.frames.map((frame) => parseObject(frame.data)['method'])).toStrictEqual(['Browser.getVersion']);
      },
    );

    it('forwards Target.createTarget with background set', async () => {
      const client = await connect(proxy, '/devtools/browser/B');
      client.socket.send(JSON.stringify({ id: 3, method: 'Target.createTarget', params: { url: 'about:blank' } }));
      await expect(client.next()).resolves.toStrictEqual({
        data: JSON.stringify({ id: 3, result: { targetId: 'T2' } }),
        isBinary: false,
      });
      expect(parseObject(upstream.frames[0]?.data ?? '')).toStrictEqual({
        id: 3,
        method: 'Target.createTarget',
        params: { background: true, url: 'about:blank' },
      });
    });

    it('passes an unrelated command, its reply, and an event through with the same bytes and frame type', async () => {
      const client = await connect(proxy, '/devtools/browser/B');
      const command = '{ "id": 4,   "method": "Browser.getVersion" }';
      client.socket.send(command);
      const reply = await client.next();
      const event = await client.next();
      expect(upstream.frames).toStrictEqual([{ data: command, isBinary: false }]);
      expect(reply).toStrictEqual({
        data: JSON.stringify({ id: 4, result: { product: 'Fake/1.0' } }),
        isBinary: false,
      });
      expect(parseObject(event.data)).toMatchObject({ method: 'Target.targetInfoChanged' });
      expect(event.isBinary).toBe(false);
    });

    it('keeps a binary frame binary in both directions', async () => {
      const client = await connect(proxy, '/devtools/browser/B');
      client.socket.send(Buffer.from('raw'), { binary: true });
      await expect(client.next()).resolves.toStrictEqual({ data: 'raw', isBinary: true });
      expect(upstream.frames).toStrictEqual([{ data: 'raw', isBinary: true }]);
    });

    it('repeats the Origin and Host headers of the client handshake upstream', async () => {
      await connect(proxy, '/devtools/browser/B', { origin: 'http://example.test' });
      expect(upstream.handshakes[0]).toMatchObject({
        host: `127.0.0.1:${proxy.port}`,
        origin: 'http://example.test',
      });
    });

    it('refuses a handshake with the status that the upstream refused it with', async () => {
      const socket = new WebSocket(`ws://127.0.0.1:${proxy.port}${REFUSED_SOCKET_PATH}`);
      const status = new Promise<number | undefined>((resolve) => {
        socket.once('unexpected-response', (_request, response) => {
          resolve(response.statusCode);
        });
      });
      await expect(status).resolves.toBe(401);
    });

    it('closes the upstream connection when the client closes', async () => {
      const client = await connect(proxy, '/devtools/browser/B');
      const [socket] = upstream.sockets;
      const closed = once(socket ?? client.socket, 'close');
      client.socket.close();
      await expect(closed).resolves.toBeDefined();
    });

    it('closes the client connection when the upstream closes', async () => {
      const client = await connect(proxy, '/devtools/browser/B');
      const closed = once(client.socket, 'close');
      upstream.sockets[0]?.close(1001, 'going away');
      const [code] = await closed;
      expect(code).toBe(1001);
    });
  });

  describe('HTTP', () => {
    it.each(['/json/version', '/json/list'])('names the advertised port in the URLs of %s', async (path) => {
      const body = await (await fetch(`http://127.0.0.1:${proxy.port}${path}`)).text();
      expect(body).toContain(`127.0.0.1:${proxy.port}/devtools/`);
      expect(body).not.toContain(`:${upstream.port}`);
    });

    it('answers /json/activate/<id> as a success without forwarding it', async () => {
      const response = await fetch(`http://127.0.0.1:${proxy.port}/json/activate/T1`);
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('Target activated');
      expect(upstream.requests).toStrictEqual([]);
    });

    it('opens /json/new as a background target and answers with its listing', async () => {
      const response = await fetch(`http://127.0.0.1:${proxy.port}/json/new?https://example.test/a%3Fb`, {
        method: 'PUT',
      });
      expect(response.status).toBe(200);
      const entry: unknown = await response.json();
      expect(entry).toMatchObject({
        id: 'T2',
        webSocketDebuggerUrl: `ws://127.0.0.1:${proxy.port}/devtools/page/T2`,
      });
      const create = upstream.frames.map((frame) => parseObject(frame.data)).find((frame) => frame['id'] === 1);
      expect(create).toStrictEqual({
        id: 1,
        method: 'Target.createTarget',
        params: { background: true, url: 'https://example.test/a?b' },
      });
    });

    it('relays every other request with its status', async () => {
      const response = await fetch(`http://127.0.0.1:${proxy.port}/devtools/inspector.html`);
      expect(response.status).toBe(404);
      expect(upstream.requests).toStrictEqual(['GET /devtools/inspector.html']);
    });
  });
});

// region | Helpers

interface Frame {
  data: string;
  isBinary: boolean;
}

/** Connects a client to the proxy and returns it with a reader of the frames that it receives, in order. */
async function connect(
  proxy: CdpProxy,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ next: () => Promise<Frame>; socket: WebSocket }> {
  const socket = new WebSocket(`ws://127.0.0.1:${proxy.port}${path}`, { headers });
  const received: Frame[] = [];
  const waiting: Array<(frame: Frame) => void> = [];
  socket.on('message', (data: RawData, isBinary: boolean) => {
    const frame = { data: rawDataToString(data), isBinary };
    const resolve = waiting.shift();
    if (resolve === undefined) {
      received.push(frame);
    } else {
      resolve(frame);
    }
  });
  await once(socket, 'open');
  return {
    next: () => {
      const frame = received.shift();
      if (frame !== undefined) return Promise.resolve(frame);
      return new Promise((resolve) => {
        waiting.push(resolve);
      });
    },
    socket,
  };
}

/** Parses a frame that the test expects to be a JSON object. */
function parseObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`not an object: ${text}`);
  return { ...value };
}

// endregion | Helpers
