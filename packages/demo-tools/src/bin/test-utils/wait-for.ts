import { setTimeout as delay } from 'node:timers/promises';

/** Resolves once `condition` holds, polling every 50 ms, or rejects after 10 seconds. */
export async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the condition');
    await delay(50);
  }
}
