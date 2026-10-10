import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';

const SECURITY_PATH = '/usr/bin/security';

/**
 * Whether this process can create a keychain, so that a test needing one skips rather than fails when it
 * cannot. A platform without `security` and a sandbox denying the `securityd` lookup both make it false.
 * Probing once at load creates only one keychain per file, and the guards that read it run at collection.
 *
 * @internal
 */
export const canCreateKeychain = probeKeychain();

/**
 * Creates an unlocked keychain of its own, deleted on disposal, so that no test touches the login keychain.
 * Requires macOS.
 *
 * @internal
 */
export function createTempKeychain(): TempKeychain {
  using stack = new DisposableStack();

  // Registration order sets disposal order: The keychain is deleted before the directory that contains it.
  const tree = stack.use(createTempTree({}));
  const keychainPath = tree.resolve('probe.keychain-db');
  const password = randomUUID();

  runSecurity(['create-keychain', '-p', password, keychainPath]);
  stack.defer(() => runSecurity(['delete-keychain', keychainPath]));
  runSecurity(['unlock-keychain', '-p', password, keychainPath]);

  const resources = stack.move();

  return {
    path: keychainPath,

    [Symbol.dispose](): void {
      resources.dispose();
    },
  };
}

/** A keychain containing one test's items, deleted when the scope that created it ends. */
export interface TempKeychain extends Disposable {
  /** Path of the keychain file, which every `security` call names. */
  readonly path: string;
}

// region | Helpers

/**
 * Reduces a failure to the line naming its cause. `execFileSync` leads with the command that it ran, which
 * contains the probe keychain's password.
 */
function describeFailure(error: unknown): string {
  const message = describeError(error).trim();
  const cause = message.split('\n').at(-1)?.trim();

  return cause === undefined || cause === '' ? 'the reason is unknown' : cause;
}

/**
 * Creates a keychain and deletes it, reporting what refused it, so that a run that skips states its cause
 * instead of passing quietly. The notice goes to `process.stderr` because the runner's `silent: 'passed-only'`
 * withholds console output unclaimed by a failing test, which is every line that this probe writes.
 */
function probeKeychain(): boolean {
  try {
    createTempKeychain()[Symbol.dispose]();

    return true;
  } catch (error) {
    process.stderr.write(`Skipping the tests that need a keychain: ${describeFailure(error)}\n`);

    return false;
  }
}

/** Runs `security`, raising what it wrote when it fails, so that a broken fixture is not read as a result. */
function runSecurity(args: string[]): void {
  execFileSync(SECURITY_PATH, args, { encoding: 'utf8', stdio: 'pipe' });
}

// endregion | Helpers
