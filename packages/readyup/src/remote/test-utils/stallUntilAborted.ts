import assert from 'node:assert';

/** Stands in for a `fetch` that never responds, rejecting with the abort reason once the request's signal aborts. */
export function stallUntilAborted(_input: unknown, init?: RequestInit): Promise<never> {
  const signal = init?.signal;
  assert.ok(signal, 'Expected the request to be sent with an abort signal');

  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const reason: unknown = signal.reason;
      reject(reason instanceof Error ? reason : new Error('The request was aborted'));
    });
  });
}
