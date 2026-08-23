import { describe, expect, it } from 'vitest';

import { recordSweep, withSweepRecorder } from '../sweepRecorder.ts';
import { createRecorder } from '../test-utils/sweep-recording.ts';

describe(withSweepRecorder, () => {
  it('reports a sweep to the recorder in scope', () => {
    const { recorder, scanned } = createRecorder();

    withSweepRecorder(recorder, () => recordSweep(['src/a.ts']));

    expect(scanned).toStrictEqual([['src/a.ts']]);
  });

  it('reports a sweep made after an await, which is where a check makes one', async () => {
    const { recorder, scanned } = createRecorder();

    await withSweepRecorder(recorder, async () => {
      await Promise.resolve();
      recordSweep(['src/a.ts']);
    });

    expect(scanned).toStrictEqual([['src/a.ts']]);
  });

  it('returns what the scoped function returns', () => {
    const { recorder } = createRecorder();

    expect(withSweepRecorder(recorder, () => 'verdict')).toBe('verdict');
  });

  it('calls the function untouched where no recorder is passed', () => {
    expect(withSweepRecorder(undefined, () => 'verdict')).toBe('verdict');
  });

  it('keeps concurrent scopes apart', async () => {
    const first = createRecorder();
    const second = createRecorder();
    // Holds the first scope open until the second has recorded, the interleaving a single shared variable
    // holding the current recorder would get wrong.
    const { promise: gate, resolve: openGate } = Promise.withResolvers<undefined>();

    await Promise.all([
      withSweepRecorder(first.recorder, async () => {
        await gate;
        recordSweep(['src/first.ts']);
      }),
      withSweepRecorder(second.recorder, async () => {
        recordSweep(['src/second.ts']);
        openGate(undefined);
        await gate;
      }),
    ]);

    expect(first.scanned).toStrictEqual([['src/first.ts']]);
    expect(second.scanned).toStrictEqual([['src/second.ts']]);
  });

  it('reports a sweep a scope nested inside another makes to the inner recorder alone', () => {
    const outer = createRecorder();
    const inner = createRecorder();

    withSweepRecorder(outer.recorder, () => {
      withSweepRecorder(inner.recorder, () => recordSweep(['src/inner.ts']));
    });

    expect(inner.scanned).toStrictEqual([['src/inner.ts']]);
    expect(outer.scanned).toStrictEqual([]);
  });
});

describe(recordSweep, () => {
  it('reports to nothing where no scope is open', () => {
    expect(() => recordSweep(['src/a.ts'])).not.toThrow();
  });

  it('reports across two copies of this module, which the runner and a compiled kit hold', async () => {
    const copy = await importSecondCopy();
    const { recorder, scanned } = createRecorder();

    // Asserted first: reading the global on every call means one copy would satisfy the recording assertion too.
    expect(copy.recordSweep).not.toBe(recordSweep);

    withSweepRecorder(recorder, () => copy.recordSweep(['src/a.ts']));

    expect(scanned).toStrictEqual([['src/a.ts']]);
  });
});

// region | Helpers

/**
 * Loads a second copy of the module under test, as a run holds when the runner reads its own source and a
 * compiled kit resolves `readyup/*` to the built installation.
 *
 * The query string is what makes it a second copy: the loader keys modules by URL, so the same file under a
 * different URL is instantiated again.
 */
async function importSecondCopy(): Promise<typeof import('../sweepRecorder.ts')> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- a computed specifier resolves to `any`.
  return import(new URL('../sweepRecorder.ts?copy=2', import.meta.url).href);
}

// endregion | Helpers
