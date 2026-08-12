import { describe, expect, it } from 'vitest';

import type { RdyKit } from '../../kits/types.ts';
import { captureRdyError } from '../../test-utils/captureRdyError.ts';
import { selectChecklists } from '../selectChecklists.ts';

describe(selectChecklists, () => {
  it('returns every checklist when the filter names none', () => {
    expect(selectChecklists(makeKit(), []).map((checklist) => checklist.name)).toStrictEqual([
      'deploy',
      'infra',
      'lint',
    ]);
  });

  it('returns the named checklists in the order requested', () => {
    expect(selectChecklists(makeKit(), ['lint', 'deploy']).map((checklist) => checklist.name)).toStrictEqual([
      'lint',
      'deploy',
    ]);
  });

  it('returns the checklist objects themselves, not their names', () => {
    const kit = makeKit();

    expect(selectChecklists(kit, ['infra'])).toStrictEqual([kit.checklists[1]]);
  });

  it('drops a suite entry naming a checklist the kit does not declare', () => {
    const kit = makeKit({ suites: { ci: ['deploy', 'ghost'] } });

    expect(selectChecklists(kit, ['ci']).map((checklist) => checklist.name)).toStrictEqual(['deploy']);
  });

  it('reports an unknown name as a usage error', async () => {
    const error = await captureRdyError(() => selectChecklists(makeKit(), ['missing']));

    expect(error.code).toBe('usage');
    expect(error.message).toContain('Unknown name(s): missing');
  });
});

// region | Helpers

/** Builds a kit with three named checklists and optional suites. */
function makeKit(overrides?: Partial<RdyKit>): RdyKit {
  return {
    checklists: [
      { name: 'deploy', checks: [{ name: 'a', check: () => true }] },
      { name: 'infra', checks: [{ name: 'b', check: () => true }] },
      { name: 'lint', checks: [{ name: 'c', check: () => true }] },
    ],
    ...overrides,
  };
}

// endregion | Helpers
