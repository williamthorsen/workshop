/** Opens a page in a browser through its DevTools endpoint, leaving the browser behind the focused app. */
export type OpenPage = (port: string, url: string) => Promise<PageOpening>;

/** Whether a page opened, and why not when it did not. */
export type PageOpening = { isOpened: true } | { isOpened: false; reason: string };

/** How long one page opening may take, from the version lookup to the browser's reply. */
export const PAGE_OPEN_TIMEOUT_MILLISECONDS = 5000;

/**
 * Opens a page as a background target through the browser's CDP WebSocket. A browser that opens a page this way,
 * including the first one, which creates its window, does not activate itself, unlike a page that it opens from its
 * command line or from `/json/new` without a window. Resolves to the reason for any failure rather than throwing.
 */
export const openBackgroundPage: OpenPage = async (port, url) => {
  const signal = AbortSignal.timeout(PAGE_OPEN_TIMEOUT_MILLISECONDS);
  let socketUrl: string;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal });
    const version: unknown = await response.json();
    socketUrl = readSocketUrl(version) ?? '';
  } catch (error) {
    return { isOpened: false, reason: `the DevTools endpoint did not answer: ${describeError(error)}` };
  }
  if (socketUrl === '') return { isOpened: false, reason: 'the DevTools endpoint reported no WebSocket URL' };
  return createTarget(socketUrl, url, signal);
};

// region | Helpers

/** Sends one `Target.createTarget` over a fresh socket and resolves to its outcome, closing the socket on every path. */
function createTarget(socketUrl: string, url: string, signal: AbortSignal): Promise<PageOpening> {
  return new Promise((resolve) => {
    const socket = new WebSocket(socketUrl);
    const finish = (opening: PageOpening) => {
      signal.removeEventListener('abort', onAbort);
      socket.close();
      resolve(opening);
    };
    const onAbort = () => {
      finish({ isOpened: false, reason: `the browser did not answer within ${PAGE_OPEN_TIMEOUT_MILLISECONDS} ms` });
    };
    signal.addEventListener('abort', onAbort);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url, background: true } }));
    });
    socket.addEventListener('message', (event) => {
      finish(readReply(event.data));
    });
    socket.addEventListener('error', () => {
      finish({ isOpened: false, reason: `could not connect to ${socketUrl}` });
    });
  });
}

/** Returns an error's message, or the value itself as text. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Returns whether a value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads the outcome of `Target.createTarget` from the browser's reply. */
function readReply(data: unknown): PageOpening {
  let reply: unknown;
  try {
    reply = JSON.parse(String(data));
  } catch {
    return { isOpened: false, reason: 'the browser sent a reply that is not JSON' };
  }
  if (isRecord(reply) && isRecord(reply['error'])) {
    return { isOpened: false, reason: `the browser refused: ${String(reply['error']['message'])}` };
  }
  if (isRecord(reply) && isRecord(reply['result']) && typeof reply['result']['targetId'] === 'string') {
    return { isOpened: true };
  }
  return { isOpened: false, reason: 'the browser sent a reply without a target' };
}

/** Returns the `webSocketDebuggerUrl` of a `/json/version` document. */
function readSocketUrl(version: unknown): string | undefined {
  if (!isRecord(version)) return undefined;
  const socketUrl = version['webSocketDebuggerUrl'];
  return typeof socketUrl === 'string' ? socketUrl : undefined;
}

// endregion | Helpers
