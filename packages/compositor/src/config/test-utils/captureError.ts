import assert from 'node:assert';

/**
 * Runs a call expected to reject and returns the `Error` it rejected with.
 *
 * Fails the test when the call resolves or rejects with a non-`Error`, so a regression that stops the
 * failure reports itself rather than leaving a later assertion to run against `undefined`.
 */
export async function captureError(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error: unknown) {
    assert.ok(error instanceof Error, `Expected an Error, got: ${String(error)}`);
    return error;
  }
  return assert.fail('Expected the call to reject');
}
