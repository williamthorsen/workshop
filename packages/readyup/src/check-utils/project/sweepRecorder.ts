import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Where the one storage instance is kept, versioned so a later change to `SweepRecorder` stops two copies
 * sharing rather than letting incompatible ones meet.
 */
const STORAGE_KEY: unique symbol = Symbol.for('readyup.sweep-recording.v1');

/** Reports the paths a sweep read to the recorder in scope, and to nothing where no scope is open. */
export function recordSweep(paths: readonly string[]): void {
  resolveStorage().getStore()?.recordScanned(paths);
}

/**
 * What a sweep reports the paths it read to. `PragmaLedger` satisfies it, which is what lets the runner pass
 * its ledger straight in and keeps this layer from importing the run's own types.
 */
export interface SweepRecorder {
  /** Records the paths a check examined. */
  recordScanned: (paths: readonly string[]) => void;
}

/**
 * Puts a recorder in scope for `fn` and everything it awaits, and returns what `fn` returns.
 *
 * The runner opens one scope per check, so a check reads into the run's ledger without being passed one, and
 * work the runner runs outside a scope -- a skip diagnosis, its own bookkeeping -- reads into nothing. Passing
 * no recorder calls `fn` untouched, which is what a run keeping no ledger does.
 */
export function withSweepRecorder<T>(recorder: SweepRecorder | undefined, fn: () => T): T {
  if (recorder === undefined) return fn();
  return resolveStorage().run(recorder, fn);
}

// region | Helpers

/** Reports whether a value is the storage this module keeps, which is all the versioned key ever holds. */
function isSweepStorage(value: unknown): value is AsyncLocalStorage<SweepRecorder> {
  return value instanceof AsyncLocalStorage;
}

/**
 * Returns the one storage instance, opening it on the global object where this is the first copy to ask.
 *
 * The instance lives on the global rather than in this module because a compiled kit resolves `readyup/*` to
 * the runner's installation while the runner may be running from its own source, and the two then hold
 * separate copies of this file. A store held per copy would leave the kit's sweep reporting to a scope the
 * runner never opened.
 */
function resolveStorage(): AsyncLocalStorage<SweepRecorder> {
  const existing: unknown = Reflect.get(globalThis, STORAGE_KEY);
  if (isSweepStorage(existing)) return existing;

  const storage = new AsyncLocalStorage<SweepRecorder>();
  Reflect.set(globalThis, STORAGE_KEY, storage);
  return storage;
}

// endregion | Helpers
