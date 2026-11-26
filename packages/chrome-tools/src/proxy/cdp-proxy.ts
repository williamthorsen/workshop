import http from 'node:http';
import type { Duplex } from 'node:stream';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { type RawData, WebSocket, WebSocketServer } from 'ws';

import { openBackgroundPage } from '../portable/open-background-page.ts';
import { applyFocusRules } from './focus-rules.ts';
import { rawDataToString } from './raw-data.ts';

/** A running proxy, which serves the advertised port until it is closed. */
export interface CdpProxy {
  /** Closes the listener and every relayed connection at once, without draining them. */
  close: () => Promise<void>;
  /** The port on which the proxy listens, which the system chose when the listen port was `0`. */
  port: string;
}

export interface CdpProxyOptions {
  listenPort: string;
  upstreamPort: string;
}

/** WebSocket close codes that a peer reports but that an endpoint may not send. */
const RESERVED_CLOSE_CODES: ReadonlySet<number> = new Set([1004, 1005, 1006, 1015]);

/** Handshake headers that the upstream client writes for itself, which therefore are not copied from the client. */
const HANDSHAKE_HEADERS: ReadonlySet<string> = new Set([
  'connection',
  'sec-websocket-extensions',
  'sec-websocket-key',
  'sec-websocket-protocol',
  'sec-websocket-version',
  'upgrade',
]);

/**
 * Starts a DevTools proxy on the loopback interface that relays HTTP and WebSocket traffic to the browser's own
 * endpoint, so that no client of the listen port can bring the browser to the front. Client CDP messages pass through
 * `applyFocusRules`; `/json/new` opens its page as a background target, and `/json/activate/<id>` is answered without
 * effect. Every other request and message is relayed unchanged, except that `/json*` bodies name the listen port in
 * place of the upstream one, so that no URL leads a client past the proxy.
 */
export async function startCdpProxy(options: CdpProxyOptions): Promise<CdpProxy> {
  const { upstreamPort } = options;
  const sockets = new Set<WebSocket>();
  // Unlimited, because a CDP reply such as a full-page screenshot can exceed `ws`'s 100 MiB default
  const webSocketServer = new WebSocketServer({ maxPayload: 0, noServer: true });
  // The listen port is known once the server listens, when the system chose it
  const ports: PortPair = { listenPort: options.listenPort, upstreamPort };

  const server = http.createServer((request, response) => {
    void serveHttp(ports, request, response);
  });
  server.on('upgrade', (request, socket, head) => {
    relayWebSocket({ head, request, socket, sockets, upstreamPort, webSocketServer });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(options.listenPort), '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address !== null && typeof address !== 'string') ports.listenPort = String(address.port);

  return {
    close: async () => {
      for (const socket of sockets) socket.terminate();
      server.closeAllConnections();
      webSocketServer.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    port: ports.listenPort,
  };
}

// region | Helpers

interface PortPair {
  listenPort: string;
  upstreamPort: string;
}

interface WebSocketRelay {
  head: Buffer;
  request: http.IncomingMessage;
  socket: Duplex;
  sockets: Set<WebSocket>;
  upstreamPort: string;
  webSocketServer: WebSocketServer;
}

/** Closes a socket with the code and reason that its peer closed with, when an endpoint may send that code. */
function closeLike(socket: WebSocket, code: number, reason: Buffer): void {
  if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) return;
  if (RESERVED_CLOSE_CODES.has(code)) {
    socket.close();
  } else {
    socket.close(code, reason);
  }
}

/** Returns the client's request headers that the upstream handshake repeats, `Host` and `Origin` among them. */
function copyRequestHeaders(request: http.IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || HANDSHAKE_HEADERS.has(name)) continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
}

/** Returns whether a value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Opens the page that a `/json/new` query names as a background target and answers with its `/json/list` entry. */
async function openNewPage(ports: PortPair, query: string, response: http.ServerResponse): Promise<void> {
  const url = query === '' ? 'about:blank' : decodeURIComponent(query);
  const opening = await openBackgroundPage(ports.upstreamPort, url);
  if (!opening.isOpened) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=UTF-8' });
    response.end(`Could not create new page: ${opening.reason}\n`);
    return;
  }
  const listing = await fetch(`http://127.0.0.1:${ports.upstreamPort}/json/list`);
  const targets: unknown = JSON.parse(rewritePorts(await listing.text(), ports));
  const entry: unknown = Array.isArray(targets)
    ? targets.find((target) => isRecord(target) && target['id'] === opening.targetId)
    : undefined;
  response.writeHead(200, { 'content-type': 'application/json; charset=UTF-8' });
  response.end(JSON.stringify(entry ?? { id: opening.targetId, url }, undefined, 3));
}

/** Answers a WebSocket upgrade with the HTTP status that the upstream refused it with, then closes the socket. */
function refuseUpgrade(socket: Duplex, status: number, message: string): void {
  socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status] ?? ''}\r\nConnection: close\r\n\r\n${message}`);
}

/** Relays one HTTP request to the upstream, rewriting the port in a `/json*` body. */
function relayHttp(ports: PortPair, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    const isJson = (request.url ?? '').startsWith('/json');
    const upstream = http.request(
      {
        headers: request.headers,
        host: '127.0.0.1',
        method: request.method,
        path: request.url,
        port: Number(ports.upstreamPort),
      },
      (upstreamResponse) => {
        const { headers, statusCode = 502 } = upstreamResponse;
        if (!isJson) {
          response.writeHead(statusCode, headers);
          upstreamResponse.pipe(response);
          upstreamResponse.on('end', resolve);
          return;
        }
        const chunks: Buffer[] = [];
        upstreamResponse.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        upstreamResponse.on('end', () => {
          const body = rewritePorts(Buffer.concat(chunks).toString('utf8'), ports);
          const { 'content-length': _length, 'transfer-encoding': _encoding, ...rest } = headers;
          response.writeHead(statusCode, { ...rest, 'content-length': Buffer.byteLength(body) });
          response.end(body);
          resolve();
        });
      },
    );
    upstream.on('error', reject);
    request.pipe(upstream);
  });
}

/**
 * Relays one WebSocket connection: The upstream connection opens first, so that the client's handshake succeeds or
 * fails as the browser's does, and each frame keeps its text or binary type in both directions.
 */
function relayWebSocket(relay: WebSocketRelay): void {
  const { head, request, socket, sockets, upstreamPort, webSocketServer } = relay;
  const protocols = (request.headers['sec-websocket-protocol'] ?? '')
    .split(',')
    .map((protocol) => protocol.trim())
    .filter((protocol) => protocol !== '');
  const upstream = new WebSocket(`ws://127.0.0.1:${upstreamPort}${request.url ?? '/'}`, protocols, {
    headers: copyRequestHeaders(request),
    maxPayload: 0,
  });
  let isUpgraded = false;
  // A client that leaves before the upstream opens takes the upstream connection with it
  socket.once('close', () => {
    if (!isUpgraded) upstream.terminate();
  });
  socket.once('error', () => {
    if (!isUpgraded) upstream.terminate();
  });
  upstream.once('unexpected-response', (_request, upstreamResponse) => {
    refuseUpgrade(socket, upstreamResponse.statusCode ?? 502, '');
    upstreamResponse.resume();
    upstream.terminate();
  });
  upstream.on('error', (error) => {
    if (!isUpgraded) refuseUpgrade(socket, 502, `proxy error: ${describeError(error)}\n`);
  });
  upstream.once('open', () => {
    isUpgraded = true;
    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      wireSockets(client, upstream, sockets);
    });
  });
}

/** Replaces the upstream port with the listen port in every loopback `host:port` of a body. */
function rewritePorts(body: string, ports: PortPair): string {
  const pattern = new RegExp(String.raw`(127\.0\.0\.1|localhost|\[::1\]):${ports.upstreamPort}(?!\d)`, 'g');
  return body.replaceAll(pattern, (_match, host: string) => `${host}:${ports.listenPort}`);
}

/** Routes one HTTP request to the rule that serves it. */
async function routeHttp(ports: PortPair, request: http.IncomingMessage, response: http.ServerResponse) {
  const target = request.url ?? '/';
  const queryStart = target.indexOf('?');
  const pathname = queryStart === -1 ? target : target.slice(0, queryStart);
  if (pathname === '/json/new') {
    await openNewPage(ports, queryStart === -1 ? '' : target.slice(queryStart + 1), response);
    return;
  }
  if (pathname.startsWith('/json/activate/')) {
    response.writeHead(200, { 'content-type': 'text/plain; charset=UTF-8' });
    response.end('Target activated');
    return;
  }
  await relayHttp(ports, request, response);
}

/** Serves one HTTP request per the proxy's HTTP rules, answering `502` when the upstream cannot be reached. */
async function serveHttp(ports: PortPair, request: http.IncomingMessage, response: http.ServerResponse) {
  try {
    await routeHttp(ports, request, response);
  } catch (error) {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=UTF-8' });
    response.end(`proxy error: ${describeError(error)}\n`);
  }
}

/** Relays frames between a client and its upstream connection, and closes each when the other closes. */
function wireSockets(client: WebSocket, upstream: WebSocket, sockets: Set<WebSocket>): void {
  sockets.add(client);
  sockets.add(upstream);
  client.on('message', (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      upstream.send(data, { binary: true });
      return;
    }
    const text = rawDataToString(data);
    const verdict = applyFocusRules(text);
    if (verdict.kind === 'reply') {
      client.send(verdict.data, { binary: false });
    } else {
      upstream.send(verdict.data === text ? data : verdict.data, { binary: false });
    }
  });
  upstream.on('message', (data: RawData, isBinary: boolean) => {
    client.send(data, { binary: isBinary });
  });
  client.on('close', (code, reason) => {
    sockets.delete(client);
    closeLike(upstream, code, reason);
  });
  upstream.on('close', (code, reason) => {
    sockets.delete(upstream);
    closeLike(client, code, reason);
  });
  client.on('error', () => upstream.terminate());
  upstream.on('error', () => client.terminate());
}

// endregion | Helpers
