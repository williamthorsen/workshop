import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { createExaminedRecorder } from '../createExaminedRecorder.ts';
import { createPragmaLedger } from '../PragmaLedger.ts';

describe(createExaminedRecorder, () => {
  it('counts a file once however many times and in whatever form its path is recorded', () => {
    const recorder = createExaminedRecorder();

    recorder.recordScanned(['src/a.ts', 'src/b.ts']);
    recorder.recordScanned([path.resolve(process.cwd(), 'src/a.ts')]);

    expect(recorder.countExamined()).toBe(2);
  });

  it('forwards every recorded path to the recorder that it wraps', () => {
    const ledger = createPragmaLedger();
    const recorder = createExaminedRecorder(ledger);

    recorder.recordScanned(['src/a.ts']);

    expect(ledger.scannedPaths()).toStrictEqual([path.resolve(process.cwd(), 'src/a.ts')]);
  });
});
