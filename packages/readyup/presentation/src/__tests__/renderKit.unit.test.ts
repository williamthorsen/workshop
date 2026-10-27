import { describe, expect, it } from 'vitest';

import { stripEscapes } from '../../../src/layout/test-utils/stripEscapes.ts';
import type { KitModel } from '../kits.ts';
import { renderKit, type RenderOptions } from '../renderKit.ts';

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

const TWO_CHECKLIST_KIT: KitModel = {
  name: 'preflight',
  command: 'rdy run preflight',
  conditions: [{ id: 'port', label: 'Port 3000 is free', on: false }],
  checklists: [
    {
      name: 'machine',
      ms: 0,
      checks: [
        { name: 'Docker is running', severity: 'error', checks: [{ name: 'Its socket answers', severity: 'error' }] },
      ],
    },
    {
      name: 'app',
      ms: 0,
      checks: [{ name: 'Port 3000 is free', severity: 'warn', when: 'port' }],
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

  it('passes a run whose only failure is a warning at the default threshold, without echoing the threshold', () => {
    const rendered = renderKit(TWO_CHECKLIST_KIT, { port: false });
    const report = parseReport(rendered.json);

    expect(rendered.exit).toBe(0);
    expect(listPrintedLines(TWO_CHECKLIST_KIT, { port: false }).at(-1)).toBe('✅ Run passed (fail-on: error)');
    expect(report).not.toHaveProperty('failOn');
    expect(report.kits[0]).toHaveProperty('failOn', 'error');
  });

  it('fails the same run at warn, and reports the threshold in the verdict and the JSON', () => {
    const rendered = renderKit(TWO_CHECKLIST_KIT, { port: false }, { failOn: 'warn' });
    const report = parseReport(rendered.json);

    expect(rendered.exit).toBe(1);
    expect(stripEscapes(rendered.lines.findLast(({ printed }) => printed)?.text ?? '')).toBe(
      '❌ Run failed (fail-on: warn)',
    );
    expect(report).toHaveProperty('failOn', 'warn');
    expect(report.kits[0]).toHaveProperty('failOn', 'warn');
  });

  it.each([
    [{}, 'rdy run preflight'],
    [{ failOn: 'error' }, 'rdy run preflight'],
    [{ failOn: 'recommend' }, 'rdy run preflight --fail-on=recommend'],
    [{ json: true }, 'rdy run preflight --json'],
    [{ failOn: 'warn', json: true }, 'rdy run preflight --fail-on=warn --json'],
  ] satisfies Array<[RenderOptions, string]>)('opens the run with %j as `%s`', (options, command) => {
    const rendered = renderKit(TWO_CHECKLIST_KIT, { port: true }, options);

    expect(rendered.command).toBe(command);
    expect(rendered.lines[0]?.text).toBe(`$ ${command}`);
  });

  it('places each check, nested ones included, at its step, past the fix recap between checklists', () => {
    expect(renderKit(TWO_CHECKLIST_KIT, { port: true }).checkSteps).toStrictEqual([1, 2, 4]);
  });
});

// region | Helpers

/** Returns the parsed report, whose top level and first kit the tests read. */
function parseReport(json: string): { kits: unknown[] } {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || !('kits' in parsed) || !Array.isArray(parsed.kits)) {
    throw new Error('The report has no kits array');
  }
  return { ...parsed, kits: parsed.kits };
}

/** Returns the lines that rdy prints for `kit` in `env`, without escape sequences. */
function listPrintedLines(kit: KitModel, env: Record<string, boolean>): string[] {
  return renderKit(kit, env)
    .lines.filter(({ printed }) => printed)
    .map(({ text }) => stripEscapes(text));
}

// endregion | Helpers
