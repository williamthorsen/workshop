import { describe, expect, it } from 'vitest';

import { richFormatter } from '../../layout/formatter.ts';
import type { SourceGroup } from '../../sources/collectSourceGroups.ts';
import { formatConsumerView, formatManifestView, formatOwnerView, formatSourcesView } from '../formatList.ts';
import { formatRecursiveSourcesView, formatRecursiveView } from '../recursive-views.ts';
import { buildGroup, buildKit, buildProjectSources } from '../test-utils/source-group-fixtures.ts';

const COMPILED = richFormatter.tokens.kit.text;
const CHECKLIST = richFormatter.tokens.checklist.text;
const CHECK = richFormatter.tokens.check.text;

/** A deploy kit whose manifest records the check names of both its checklists. */
const RECORDED_KIT = {
  name: 'deploy',
  checklists: ['build', 'release'],
  checklistChecks: [
    { checklist: 'build', checks: ['Lockfile is current', 'Node.js runtime is v24 or later'] },
    { checklist: 'release', checks: [] },
  ],
};

/** The lines that `RECORDED_KIT` renders under `shouldShowChecks`, at the depth of a top-level kit. */
const RECORDED_KIT_LINES = [
  `${COMPILED} deploy`,
  `   ${CHECKLIST} build`,
  `      ${CHECK} Lockfile is current`,
  `      ${CHECK} Node.js runtime is v24 or later`,
  `   ${CHECKLIST} release`,
];

describe('check names', () => {
  it('nests each checklist\u{2019}s check names beneath it under shouldShowChecks', () => {
    const lines = formatOwnerView({ internalKits: [], compiledKits: [RECORDED_KIT], shouldShowChecks: true }).split(
      '\n',
    );

    expect(lines.slice(2)).toStrictEqual(RECORDED_KIT_LINES);
  });

  it('omits recorded check names without shouldShowChecks', () => {
    const result = formatOwnerView({ internalKits: [], compiledKits: [RECORDED_KIT] });

    expect(result).not.toContain(CHECK);
    expect(result).not.toContain('not recorded');
  });

  it('notes a kit whose manifest does not record its check names, after its description', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [{ name: 'legacy', description: 'Older kit', checklists: ['setup'] }],
      shouldShowChecks: true,
    });

    expect(result).toContain(
      `${COMPILED} legacy \u{00B7} Older kit (checks not recorded; recompile to record them)\n   ${CHECKLIST} setup`,
    );
  });

  it('notes an undescribed kit whose manifest does not record its check names', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [{ name: 'legacy', checklists: ['setup'] }],
      shouldShowChecks: true,
    });

    expect(result).toContain(`${COMPILED} legacy \u{00B7} (checks not recorded; recompile to record them)`);
  });

  it('does not note a kit that records no checklists', () => {
    const result = formatOwnerView({ internalKits: [], compiledKits: [{ name: 'bare' }], shouldShowChecks: true });

    expect(result).not.toContain('not recorded');
  });

  it('renders check names in the consumer view', () => {
    const result = formatConsumerView({
      compiledKits: [RECORDED_KIT],
      fromArg: '.',
      kitsDir: '.',
      shouldShowChecks: true,
    });

    expect(result).toContain(RECORDED_KIT_LINES.join('\n'));
  });

  it('renders check names in the manifest view', () => {
    const result = formatManifestView({ kits: [RECORDED_KIT], manifestPath: 'manifest.json', shouldShowChecks: true });

    expect(result).toContain(RECORDED_KIT_LINES.join('\n'));
  });

  it('renders check names in the recursive view', () => {
    const result = formatRecursiveView({
      projects: [{ dir: '.', compiledKits: [RECORDED_KIT], compiledStyle: { kind: 'local-convention' } }],
      shouldShowChecks: true,
    });

    expect(result).toContain(RECORDED_KIT_LINES.join('\n'));
  });

  it('renders check names in the sources view', () => {
    const result = formatSourcesView({ groups: [buildRecordedGroup()], shouldShowChecks: true });

    expect(result).toContain(RECORDED_KIT_LINES.join('\n'));
  });

  it('renders check names two levels deeper in the repo-wide sources view', () => {
    const result = formatRecursiveSourcesView({
      projects: [buildProjectSources({ dir: '.', groups: [buildRecordedGroup()] })],
      shouldShowChecks: true,
    });

    expect(result).toContain(RECORDED_KIT_LINES.map((line) => `      ${line}`).join('\n'));
  });
});

// region | Helpers

/** Builds a configured package group publishing `RECORDED_KIT`. */
function buildRecordedGroup(): SourceGroup {
  return {
    ...buildGroup({ packageName: '@acme/kits', kits: [] }),
    kits: [
      {
        ...buildKit('@acme/kits', RECORDED_KIT.name, undefined, RECORDED_KIT.checklists),
        checklistChecks: RECORDED_KIT.checklistChecks,
      },
    ],
  };
}

// endregion | Helpers
