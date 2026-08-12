import assert from 'node:assert';

import { RdyError } from '../errors/RdyError.ts';

/**
 * Runs a call expected to fail and returns the `RdyError` it threw or rejected with.
 *
 * Accepts a synchronous or an asynchronous call. Fails the test when the call completes normally or
 * throws anything else.
 */
export async function captureRdyError(run: () => unknown): Promise<RdyError> {
  try {
    await run();
  } catch (error: unknown) {
    assert.ok(error instanceof RdyError, `Expected an RdyError, got: ${String(error)}`);
    return error;
  }
  return assert.fail('Expected the command to throw an RdyError');
}
