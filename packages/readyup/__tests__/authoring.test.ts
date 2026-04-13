import { describe, expect, it } from 'vitest';

import {
  defineChecklists,
  defineRdyChecklist,
  defineRdyConfig,
  defineRdyKit,
  defineRdyStagedChecklist,
} from '../src/authoring.ts';

describe(defineChecklists, () => {
  it('returns its input unchanged', () => {
    const checklists = [{ name: 'test', checks: [{ name: 'a', check: () => true }] }];

    expect(defineChecklists(checklists)).toBe(checklists);
  });
});

describe(defineRdyConfig, () => {
  it('returns its input unchanged', () => {
    const config = {
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits' },
    };

    expect(defineRdyConfig(config)).toBe(config);
  });
});

describe(defineRdyKit, () => {
  it('returns its input unchanged', () => {
    const kit = {
      checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true }] }],
    };

    expect(defineRdyKit(kit)).toBe(kit);
  });
});

describe(defineRdyChecklist, () => {
  it('returns its input unchanged', () => {
    const checklist = { name: 'test', checks: [{ name: 'a', check: () => true }] };

    expect(defineRdyChecklist(checklist)).toBe(checklist);
  });
});

describe(defineRdyStagedChecklist, () => {
  it('returns its input unchanged', () => {
    const checklist = { name: 'test', groups: [[{ name: 'a', check: () => true }]] };

    expect(defineRdyStagedChecklist(checklist)).toBe(checklist);
  });
});
