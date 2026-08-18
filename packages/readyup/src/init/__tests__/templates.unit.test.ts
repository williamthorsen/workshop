import { describe, expect, it } from 'vitest';

import { rdyKitTemplate } from '../templates.ts';

describe('rdyKitTemplate', () => {
  // One of two pointers at the skill; the help output carries the other, pinned in `route.unit.test.ts`.
  it('points at the authoring skill', () => {
    expect(rdyKitTemplate).toContain('consult-readyup-kits');
  });
});
