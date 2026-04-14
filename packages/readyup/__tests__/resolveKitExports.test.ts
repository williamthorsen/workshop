import { describe, expect, it } from 'vitest';

import { resolveKitExports } from '../src/resolveKitExports.ts';

describe(resolveKitExports, () => {
  it('extracts checklists from a module with named exports', () => {
    const checklists = [{ name: 'a', checks: [] }];
    const result = resolveKitExports({ checklists });

    expect(result).toStrictEqual({ checklists });
  });

  it('unwraps checklists from a default export', () => {
    const checklists = [{ name: 'a', checks: [] }];
    const result = resolveKitExports({ default: { checklists } });

    expect(result).toStrictEqual({ checklists });
  });

  it('forwards fixLocation when defined', () => {
    const checklists = [{ name: 'a', checks: [] }];
    const result = resolveKitExports({ checklists, fixLocation: 'inline' });

    expect(result).toStrictEqual({ checklists, fixLocation: 'inline' });
  });

  it('omits fixLocation when undefined', () => {
    const checklists = [{ name: 'a', checks: [] }];
    const result = resolveKitExports({ checklists });

    expect(result).not.toHaveProperty('fixLocation');
  });

  it('forwards suites when defined', () => {
    const checklists = [{ name: 'a', checks: [] }];
    const suites = { ci: ['a'] };
    const result = resolveKitExports({ checklists, suites });

    expect(result).toStrictEqual({ checklists, suites });
  });

  it('omits suites when undefined', () => {
    const checklists = [{ name: 'a', checks: [] }];
    const result = resolveKitExports({ checklists });

    expect(result).not.toHaveProperty('suites');
  });

  it('forwards description when defined', () => {
    const checklists = [{ name: 'a', checks: [] }];
    const result = resolveKitExports({ checklists, description: 'Health checks' });

    expect(result).toStrictEqual({ checklists, description: 'Health checks' });
  });

  it('omits description when undefined', () => {
    const checklists = [{ name: 'a', checks: [] }];
    const result = resolveKitExports({ checklists });

    expect(result).not.toHaveProperty('description');
  });

  it('forwards both fixLocation and suites from a default export', () => {
    const checklists = [{ name: 'a', checks: [] }];
    const suites = { ci: ['a'] };
    const result = resolveKitExports({ default: { checklists, fixLocation: 'end', suites } });

    expect(result).toStrictEqual({ checklists, fixLocation: 'end', suites });
  });

  it('throws when checklists is missing', () => {
    expect(() => resolveKitExports({ other: 'value' })).toThrow('must export checklists');
  });
});
