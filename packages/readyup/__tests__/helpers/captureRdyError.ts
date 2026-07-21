import assert from 'node:assert';

import { RdyError } from '../../src/errors.ts';

/**
 * Run a command expected to fail and return the `RdyError` it threw.
 *
 * Fails the test when the command completes normally or throws anything else.
 */
export async function captureRdyError(run: () => number | Promise<number>): Promise<RdyError> {
  try {
    await run();
  } catch (error: unknown) {
    assert.ok(error instanceof RdyError, `Expected an RdyError, got: ${String(error)}`);
    return error;
  }
  return assert.fail('Expected the command to throw an RdyError');
}
