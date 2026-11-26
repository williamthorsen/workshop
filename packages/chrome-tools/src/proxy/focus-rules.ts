/** What the proxy does with one client-to-browser message: forward it, or answer it without forwarding. */
export type FocusVerdict = { data: string; kind: 'forward' } | { data: string; kind: 'reply' };

/** CDP methods that bring the browser to the front, which the proxy answers with success instead of forwarding. */
const SUPPRESSED_METHODS: ReadonlySet<string> = new Set(['Page.bringToFront', 'Target.activateTarget']);

/**
 * Applies the focus rules to one client-to-browser CDP message: `Target.createTarget` is forwarded as a background
 * create in an existing window, and an activation request is answered with an empty success. Every other message,
 * including one that is not a JSON command, is forwarded with its original text.
 */
export function applyFocusRules(data: string): FocusVerdict {
  const message = parseCommand(data);
  if (message === undefined) return { data, kind: 'forward' };

  if (message.method === 'Target.createTarget') {
    // A target in a context without a window still gets one, so dropping newWindow loses only the extra window
    const { newWindow: _newWindow, ...params } = isRecord(message['params']) ? message['params'] : {};
    return { data: JSON.stringify({ ...message, params: { ...params, background: true } }), kind: 'forward' };
  }
  if (SUPPRESSED_METHODS.has(message.method)) {
    const sessionId = message['sessionId'];
    const reply = { id: message['id'], result: {}, ...(sessionId !== undefined && { sessionId }) };
    return { data: JSON.stringify(reply), kind: 'reply' };
  }
  return { data, kind: 'forward' };
}

// region | Helpers

/** Returns whether a value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns a message parsed as a CDP command with a string `method`, or `undefined` for anything else. */
function parseCommand(data: string): (Record<string, unknown> & { method: string }) | undefined {
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!isRecord(message)) return undefined;
  const { method } = message;
  return typeof method === 'string' ? { ...message, method } : undefined;
}

// endregion | Helpers
