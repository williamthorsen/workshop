import http from 'node:http';

import { type RawData, type WebSocket, WebSocketServer } from 'ws';

import { rawDataToString } from '../raw-data.ts';

/** A fake browser DevTools endpoint that records what reaches it. */
export interface FakeUpstream {
  close: () => Promise<void>;
  /** Every WebSocket frame received, in order, as text, with its frame type. */
  frames: Array<{ data: string; isBinary: boolean }>;
  /** The headers of each WebSocket handshake that the upstream accepted. */
  handshakes: http.IncomingHttpHeaders[];
  port: string;
  /** Every HTTP request received, as `METHOD path`. */
  requests: string[];
  /** The upstream side of every accepted WebSocket connection. */
  sockets: WebSocket[];
}

/** The WebSocket path that the fake refuses, as a browser refuses a client whose origin it does not accept. */
export const REFUSED_SOCKET_PATH = '/devtools/refused';

/**
 * Starts a fake DevTools endpoint on an ephemeral loopback port. It answers `/json/version` and `/json/list` with URLs
 * that name its own port, `Target.createTarget` with a new target that `/json/list` then includes, and
 * `Browser.getVersion` with a reply followed by an event. It echoes a binary frame as binary.
 */
export async function startFakeUpstream(): Promise<FakeUpstream> {
  const frames: FakeUpstream['frames'] = [];
  const handshakes: FakeUpstream['handshakes'] = [];
  const requests: string[] = [];
  const sockets: WebSocket[] = [];
  const targets = ['T1'];
  let port = '';

  const server = http.createServer((request, response) => {
    requests.push(`${request.method ?? ''} ${request.url ?? ''}`);
    if (request.url === '/json/version') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/B` }));
      return;
    }
    if (request.url === '/json/list') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(targets.map((id) => composeTarget(id, port))));
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  const webSocketServer = new WebSocketServer({
    server,
    verifyClient: (info: { req: http.IncomingMessage }) => info.req.url !== REFUSED_SOCKET_PATH,
  });
  webSocketServer.on('connection', (socket, request) => {
    handshakes.push(request.headers);
    sockets.push(socket);
    socket.on('message', (data: RawData, isBinary: boolean) => {
      const text = rawDataToString(data);
      frames.push({ data: text, isBinary });
      if (isBinary) {
        socket.send(data, { binary: true });
        return;
      }
      answerCommand(socket, text, targets);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the fake upstream has no TCP port');
  port = String(address.port);

  return {
    close: async () => {
      for (const socket of webSocketServer.clients) socket.terminate();
      webSocketServer.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    frames,
    handshakes,
    port,
    requests,
    sockets,
  };
}

// region | Helpers

/** Answers the CDP commands that the fake knows, and ignores the rest. */
function answerCommand(socket: WebSocket, text: string, targets: string[]): void {
  const command: unknown = JSON.parse(text);
  if (typeof command !== 'object' || command === null || !('id' in command) || !('method' in command)) return;
  const { id, method } = command;
  if (method === 'Target.createTarget') {
    const targetId = `T${targets.length + 1}`;
    targets.push(targetId);
    socket.send(JSON.stringify({ id, result: { targetId } }));
  } else if (method === 'Browser.getVersion') {
    socket.send(JSON.stringify({ id, result: { product: 'Fake/1.0' } }));
    socket.send(JSON.stringify({ method: 'Target.targetInfoChanged', params: { targetInfo: { targetId: 'T1' } } }));
  }
}

/** Returns the `/json/list` entry of a target, with URLs that name the upstream port. */
function composeTarget(id: string, port: string) {
  return {
    devtoolsFrontendUrl: `/devtools/inspector.html?ws=127.0.0.1:${port}/devtools/page/${id}`,
    id,
    type: 'page',
    url: 'about:blank',
    webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${id}`,
  };
}

// endregion | Helpers
