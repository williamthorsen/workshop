import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { createPragmaLedger } from '../PragmaLedger.ts';

describe(createPragmaLedger, () => {
  it('records no path and no suppression until a check declares something', () => {
    const ledger = createPragmaLedger();

    expect(ledger.scannedPaths()).toStrictEqual([]);
    expect(ledger.hasSuppressed('src/a.ts', 3)).toBe(false);
  });

  it('resolves every recorded path against the working directory', () => {
    const ledger = createPragmaLedger();

    ledger.recordScanned(['src/a.ts']);

    expect(ledger.scannedPaths()).toStrictEqual([path.resolve(process.cwd(), 'src/a.ts')]);
  });

  it('holds a path declared once however many checks declare it', () => {
    const ledger = createPragmaLedger();

    ledger.recordScanned(['src/a.ts', 'src/b.ts']);
    ledger.recordScanned([path.resolve(process.cwd(), 'src/a.ts')]);

    expect(ledger.scannedPaths()).toHaveLength(2);
  });

  it('matches a relative suppression against the absolute form of the same site', () => {
    const ledger = createPragmaLedger();

    ledger.recordSuppressed('src/a.ts', 3);

    expect(ledger.hasSuppressed(path.resolve(process.cwd(), 'src/a.ts'), 3)).toBe(true);
  });

  it('holds a suppression to the line it was recorded on', () => {
    const ledger = createPragmaLedger();

    ledger.recordSuppressed('src/a.ts', 3);

    expect(ledger.hasSuppressed('src/a.ts', 4)).toBe(false);
    expect(ledger.hasSuppressed('src/b.ts', 3)).toBe(false);
  });
});
