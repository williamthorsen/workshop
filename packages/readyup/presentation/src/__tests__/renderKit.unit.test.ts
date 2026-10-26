import { describe, expect, it } from 'vitest';

import { stripEscapes } from '../../../src/layout/test-utils/stripEscapes.ts';
import type { KitModel } from '../kits.ts';
import { renderKit } from '../renderKit.ts';

const FINDINGS_KIT: KitModel = {
  name: 'default',
  command: 'rdy run --from github:acme/diagnose',
  origin: { source: 'github:acme/diagnose', version: 'main' },
  conditions: [{ id: 'clean', label: 'Every site is clean', on: false }],
  checklists: [
    {
      name: 'adoption',
      ms: 0,
      checks: [
        {
          name: 'No source imports the legacy entry',
          severity: 'warn',
          when: 'clean',
          findings: true,
          examined: 10,
          sites: ['src/a.ts:1', 'src/a.ts:5', 'src/b.ts:2'],
        },
      ],
    },
  ],
};

describe(renderKit, () => {
  it('starts with the command as a line that rdy did not print', () => {
    const [first] = renderKit(FINDINGS_KIT, { clean: true }).lines;

    expect(first).toStrictEqual({ at: 0, printed: false, text: '$ rdy run --from github:acme/diagnose' });
  });

  it('heads a kit from a repository with the remote breadcrumb', () => {
    const printed = listPrintedLines(FINDINGS_KIT, { clean: true });

    expect(printed[0]).toContain('🌐 github:acme/diagnose@main');
  });

  it('counts each failing file once and lists the sites on the detail line', () => {
    const printed = listPrintedLines(FINDINGS_KIT, { clean: false });
    const checkIndex = printed.findIndex((line) => line.includes('No source imports the legacy entry'));

    expect(printed[checkIndex]).toContain('[8 of 10]');
    expect(printed[checkIndex + 1]?.trim()).toBe('src/a.ts:1, src/a.ts:5, src/b.ts:2');
  });

  it('passes every examined file when the check passes', () => {
    const printed = listPrintedLines(FINDINGS_KIT, { clean: true });

    expect(printed.find((line) => line.includes('No source imports the legacy entry'))).toContain('[10 of 10]');
  });
});

// region | Helpers

/** Returns the lines that rdy prints for `kit` in `env`, without escape sequences. */
function listPrintedLines(kit: KitModel, env: Record<string, boolean>): string[] {
  return renderKit(kit, env)
    .lines.filter(({ printed }) => printed)
    .map(({ text }) => stripEscapes(text));
}

// endregion | Helpers
