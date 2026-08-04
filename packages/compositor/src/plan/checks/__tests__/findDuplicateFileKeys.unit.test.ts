import { describe, expect, it } from 'vitest';

import { buildPlan } from '../../../test-utils/buildPlan.ts';
import { requireEntry } from '../../../test-utils/requireEntry.ts';
import { findDuplicateFileKeys } from '../findDuplicateFileKeys.ts';

describe(findDuplicateFileKeys, () => {
  it('accepts a plan whose files each claim their own destination', () => {
    expect(findDuplicateFileKeys(buildPlan())).toStrictEqual([]);
  });

  it('if two file entries claim one destination, names the repeated path', () => {
    const plan = buildPlan();
    plan.files = [...plan.files, { ...requireEntry(plan.files, 0) }];

    expect(findDuplicateFileKeys(plan)).toStrictEqual([
      { path: 'files[1]', message: 'repeats the destination "skills/review/SKILL.md" within target "claude"' },
    ]);
  });

  it('tolerates one path claimed once per target, since the destination is keyed by the pair', () => {
    const plan = buildPlan();
    plan.targets = [...plan.targets, { id: 'rovodev', label: 'Rovo Dev', root: '~/.rovodev', tokenMappings: [] }];
    plan.files = [...plan.files, { ...requireEntry(plan.files, 0), targetId: 'rovodev' }];

    expect(findDuplicateFileKeys(plan)).toStrictEqual([]);
  });
});
