import assert from 'node:assert';

/**
 * Runs a call expected to fail and returns the `Error` it threw or rejected with.
 *
 * Accepts a synchronous or an asynchronous call. Fails the test when the call completes normally or
 * produces a non-`Error`, so a regression that stops the failure reports itself rather than leaving a
 * later assertion to fail against `undefined`.
 */
export async function captureError(run: () => unknown): Promise<Error> {
  try {
    await run();
  } catch (error: unknown) {
    assert.ok(error instanceof Error, `Expected an Error, got: ${String(error)}`);
    return error;
  }
  return assert.fail('Expected the call to throw');
}
