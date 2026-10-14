import { describe, expect, it } from 'vitest';

import { rdyKitTemplate } from '../templates.ts';

describe('rdyKitTemplate', () => {
  // One of two pointers at the skill; the help output contains the other, pinned in `route.unit.test.ts`.
  it('points at the authoring skill and at how to install it', () => {
    expect(rdyKitTemplate).toContain('consult-readyup-kits');
    expect(rdyKitTemplate).toContain('rdy help authoring');
  });
});
