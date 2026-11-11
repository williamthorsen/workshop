import { describe, expect, it, vi } from 'vitest';

import { CLAUDE_TARGET, SETTINGS_HOOKS } from '../../test-utils/sample-render-targets.ts';
import { findOwnedItemsFaults } from '../findOwnedItemsFaults.ts';

const defect = new Error('defect inside the sentinel validator');

vi.mock(import('../../../ownership/structured/sentinel.ts'), async (importOriginal) => ({
  ...(await importOriginal()),
  findStampFault: () => {
    throw defect;
  },
}));

describe(findOwnedItemsFaults, () => {
  it('lets a defect thrown inside the sentinel validator propagate rather than reporting it as a violation', () => {
    expect(() => findOwnedItemsFaults({ ...CLAUDE_TARGET, ownedItems: [SETTINGS_HOOKS] }, 'targets[0]')).toThrow(
      defect,
    );
  });
});
