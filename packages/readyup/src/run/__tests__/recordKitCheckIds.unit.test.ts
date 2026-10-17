import { describe, expect, it } from 'vitest';

import type { RdyKit } from '../../kits/types.ts';
import { createPragmaLedger, type PragmaLedger } from '../PragmaLedger.ts';
import { recordKitCheckIds } from '../recordKitCheckIds.ts';

describe(recordKitCheckIds, () => {
  it('records every checklist of the kit, each check followed by its dependents', () => {
    const kit: RdyKit = {
      checklists: [
        {
          name: 'build',
          checks: [
            {
              name: 'parent',
              id: 'parent',
              check: () => true,
              checks: [{ name: 'child', id: 'child', check: () => true }],
            },
          ],
        },
        { name: 'test', checks: [{ name: 'other', id: 'other', check: () => true }] },
      ],
    };

    expect(bareIds(recording(kit))).toStrictEqual(['parent', 'child', 'other']);
  });

  it('records the preconditions and every group of a staged checklist', () => {
    const kit: RdyKit = {
      checklists: [
        {
          name: 'staged',
          preconditions: [{ name: 'gate', id: 'gate', check: () => true }],
          groups: [
            [{ name: 'first', id: 'first', check: () => true }],
            [{ name: 'second', id: 'second', check: () => true }],
          ],
        },
      ],
    };

    expect(bareIds(recording(kit))).toStrictEqual(['gate', 'first', 'second']);
  });

  it('records the parent of checks built at run time, without calling the builder', () => {
    const kit: RdyKit = {
      checklists: [
        {
          name: 'build',
          checks: [
            {
              name: 'parent',
              id: 'parent',
              check: () => true,
              checks: () => {
                throw new Error('built while recording');
              },
            },
          ],
        },
      ],
    };

    expect(bareIds(recording(kit))).toStrictEqual(['parent']);
  });

  it('records the ids in the namespace of the kit', () => {
    const ledger = createPragmaLedger();
    const kit: RdyKit = { checklists: [{ name: 'build', checks: [{ name: 'a', id: 'a', check: () => true }] }] };

    recordKitCheckIds(kit, ledger, {
      kind: 'package',
      packageName: '@acme/kit',
      source: 'npm:@acme/kit',
      version: '1.0.0',
    });

    expect(ledger.checkIds().map((ids) => ids.printed)).toStrictEqual(['kit/a']);
  });

  it('records nothing for a check declaring no id', () => {
    const kit: RdyKit = { checklists: [{ name: 'build', checks: [{ name: 'anonymous', check: () => true }] }] };

    expect(recording(kit).checkIds()).toStrictEqual([]);
  });
});

// region | Helpers

/** Returns the declared id of each check recorded in a ledger. */
function bareIds(ledger: PragmaLedger): string[] {
  return ledger.checkIds().map((ids) => ids.bare);
}

/** Records a kit without provenance into a fresh ledger and returns the ledger. */
function recording(kit: RdyKit): PragmaLedger {
  const ledger = createPragmaLedger();
  recordKitCheckIds(kit, ledger, undefined);
  return ledger;
}

// endregion | Helpers
