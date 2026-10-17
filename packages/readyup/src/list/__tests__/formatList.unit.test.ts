import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { richFormatter } from '../../layout/formatter.ts';
import type { SourceGroup } from '../../sources/collectSourceGroups.ts';
import {
  formatConsumerView,
  formatEmpty,
  formatManifestView,
  formatOwnerView,
  formatRecursiveSourcesView,
  formatRecursiveView,
  formatSourcesView,
  resolveCompiledStyle,
} from '../formatList.ts';
import { buildGroup, buildKit, buildProjectSources } from '../test-utils/source-group-fixtures.ts';

const COMPILED = richFormatter.tokens.kit.text;
const INTERNAL = richFormatter.tokens.kitSource.text;
const PACKAGE = richFormatter.tokens.sourcePackage.text;
const REMOTE = richFormatter.tokens.sourceRemote.text;
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

/** The lines that `RECORDED_KIT` renders under `showChecks`, at the depth of a top-level kit. */
const RECORDED_KIT_LINES = [
  `${COMPILED} deploy`,
  `   ${CHECKLIST} build`,
  `      ${CHECK} Lockfile is current`,
  `      ${CHECK} Node.js runtime is v24 or later`,
  `   ${CHECKLIST} release`,
];

describe(formatOwnerView, () => {
  it('renders only the Uncompiled section when compiled kits are empty', () => {
    const result = formatOwnerView({
      sourceKits: ['default', 'deploy'],
      internalKits: [],
      compiledKits: [],
    });

    expect(result).toContain('\u{2500}\u{2500} Uncompiled');
    expect(result).not.toContain('\u{2500}\u{2500} Compiled');
    expect(result).toContain('deploy');
  });

  it('heads the Uncompiled section with the plain --jit command', () => {
    const result = formatOwnerView({
      sourceKits: ['default'],
      internalKits: [],
      compiledKits: [],
    });

    expect(findSectionCommand(result, 'Uncompiled')).toBe('   To run: rdy run --jit [<kit>[:<checklist>,...]]');
  });

  it('heads the Internal section with the --internal command', () => {
    const result = formatOwnerView({
      sourceKits: [],
      internalKits: ['default'],
      compiledKits: [],
    });

    expect(findSectionCommand(result, 'Internal')).toBe(
      '   To run: rdy run --jit --internal [<kit>[:<checklist>,...]]',
    );
  });

  it('renders the source and internal sections as separate axes, sources first', () => {
    const result = formatOwnerView({
      sourceKits: ['deploy'],
      internalKits: ['audit'],
      compiledKits: [],
    });

    expect(result.indexOf('\u{2500}\u{2500} Uncompiled')).toBeLessThan(result.indexOf('\u{2500}\u{2500} Internal'));
    expect(findSectionCommand(result, 'Uncompiled')).not.toContain('--internal');
    expect(findSectionCommand(result, 'Internal')).toContain('--internal');
  });

  it('renders only the Compiled section when the project has no sources', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [{ name: 'deploy' }],
    });

    expect(result).not.toContain('\u{2500}\u{2500} Uncompiled');
    expect(result).not.toContain('\u{2500}\u{2500} Internal');
    expect(result).toContain('\u{2500}\u{2500} Compiled');
    expect(result).toContain('deploy');
  });

  it('splits the section title from its command onto two lines', () => {
    const result = formatOwnerView({
      sourceKits: ['deploy'],
      internalKits: [],
      compiledKits: [],
    });
    const lines = result.split('\n');

    expect(lines[0]).toBe('\u{2500}\u{2500} Uncompiled');
    expect(lines[1]).toBe('   To run: rdy run --jit <kit>[:<checklist>,...]');
    expect(lines[2]).toBe(`${INTERNAL} deploy`);
  });

  // A blank separates one section from the next, and the first section opens the output with no blank at all.
  it('separates one section from the next with a blank line, opening with none', () => {
    const lines = formatOwnerView({
      sourceKits: ['deploy'],
      internalKits: [],
      compiledKits: [{ name: 'monitor' }],
    }).split('\n');
    const titleIndexes = lines
      .map((line, index) => (line.startsWith('\u{2500}\u{2500} ') ? index : -1))
      .filter((index) => index !== -1);

    expect(titleIndexes).toStrictEqual([0, 4]);
    expect(lines[3]).toBe('');
  });

  it('fuses neither the command into the title nor the title into the command', () => {
    const result = formatOwnerView({
      sourceKits: ['deploy'],
      internalKits: [],
      compiledKits: [],
    });

    expect(result).not.toContain('Uncompiled: rdy run');
  });

  it('uses brackets around positional name in the source hint when default exists', () => {
    const result = formatOwnerView({
      sourceKits: ['default'],
      internalKits: [],
      compiledKits: [{ name: 'deploy' }],
    });

    expect(findSectionCommand(result, 'Uncompiled')).toBe('   To run: rdy run --jit [<kit>[:<checklist>,...]]');
    expect(findSectionCommand(result, 'Compiled')).toBe('   To run: rdy run <kit>[:<checklist>,...]');
  });

  it('uses brackets in compiled hint when default is in compiled kits', () => {
    const result = formatOwnerView({
      sourceKits: ['deploy'],
      internalKits: [],
      compiledKits: [{ name: 'default' }, { name: 'monitor' }],
    });

    expect(findSectionCommand(result, 'Uncompiled')).toBe('   To run: rdy run --jit <kit>[:<checklist>,...]');
    expect(findSectionCommand(result, 'Compiled')).toBe('   To run: rdy run [<kit>[:<checklist>,...]]');
  });

  it('omits brackets around positional name when no default kit exists', () => {
    const result = formatOwnerView({
      sourceKits: ['deploy'],
      internalKits: [],
      compiledKits: [],
    });

    expect(result).toContain('rdy run --jit <kit>[:<checklist>,...]');
    expect(result).not.toContain('[<kit>[:<checklist>,...]]');
  });

  it('includes --jit in source hints but not compiled hints', () => {
    const result = formatOwnerView({
      sourceKits: ['default'],
      internalKits: [],
      compiledKits: [{ name: 'deploy' }],
    });

    expect(findSectionCommand(result, 'Uncompiled')).toContain('--jit');
    expect(findSectionCommand(result, 'Compiled')).not.toContain('--jit');
  });

  // Discovery is not run selection, so the rows list every published kit and the optional name can select each.
  it('heads the Configured sources section with the optional-name form of the run command', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [],
      configuredKits: [
        { name: 'default', sourceKind: 'package' },
        { name: 'npm-auto-publish', sourceKind: 'package' },
      ],
    });

    expect(findSectionCommand(result, 'Configured sources')).toBe('   To run: rdy run --sources [<kit>]');
    expect(result).toContain('default');
    expect(result).toContain('npm-auto-publish');
  });

  // The section is headed by what to do about these packages, not by a command. A run label would misname that line.
  it('heads the Available section with its instruction, unlabelled', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [],
      availableSources: ['npm:@acme/release-kit'],
    });

    expect(findSectionCommand(result, 'Available')).toBe(
      `   Add to "sources" in the readyup config, e.g. sources: ['npm:@acme/release-kit']`,
    );
  });

  it('shows the config syntax with the first candidate alone, so that it does not read as the whole list', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [],
      availableSources: ['npm:@acme/lint-kit', 'npm:@acme/release-kit'],
    });

    expect(findSectionCommand(result, 'Available')).toBe(
      `   Add to "sources" in the readyup config, e.g. sources: ['npm:@acme/lint-kit']`,
    );
  });

  it('nests each compiled kit\u{2019}s checklists beneath it, in the order given', () => {
    const lines = formatOwnerView({
      internalKits: [],
      compiledKits: [{ name: 'deploy', checklists: ['release', 'build'] }, { name: 'monitor' }],
    }).split('\n');

    expect(lines.slice(2)).toStrictEqual([
      `${COMPILED} deploy`,
      `   ${CHECKLIST} release`,
      `   ${CHECKLIST} build`,
      `${COMPILED} monitor`,
    ]);
  });

  it('nests a package kit\u{2019}s checklists beneath its label', () => {
    const lines = formatOwnerView({
      internalKits: [],
      compiledKits: [],
      configuredKits: [{ name: 'readyup@0.36.0 / default', checklists: ['setup', 'freshness'], sourceKind: 'package' }],
    }).split('\n');

    expect(lines.slice(2)).toStrictEqual([
      `${PACKAGE} readyup@0.36.0 / default`,
      `   ${CHECKLIST} setup`,
      `   ${CHECKLIST} freshness`,
    ]);
  });

  it('heads a repository kit with the remote glyph', () => {
    const lines = formatOwnerView({
      internalKits: [],
      compiledKits: [],
      configuredKits: [{ name: 'github:acme/.github / callers', sourceKind: 'repository' }],
    }).split('\n');

    expect(lines.slice(2)).toStrictEqual([`${REMOTE} github:acme/.github / callers`]);
  });

  it('returns empty-owner message when both lists are empty', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [],
    });

    expect(result).toBe(
      'No kits found.\nRun `rdy init` to scaffold an internal kit or `rdy compile` to compile a kit from source.',
    );
  });

  it('renders both sections when both have kits', () => {
    const result = formatOwnerView({
      sourceKits: ['default'],
      internalKits: [],
      compiledKits: [{ name: 'deploy' }],
    });

    expect(result).toContain('\u{2500}\u{2500} Uncompiled');
    expect(result).toContain('\u{2500}\u{2500} Compiled');
  });
});

describe(formatConsumerView, () => {
  it('renders compiled kits with the from arg in the hint', () => {
    const result = formatConsumerView({
      compiledKits: [{ name: 'default' }, { name: 'deploy' }],
      fromArg: '.',
      kitsDir: '/resolved/.readyup/kits',
    });

    expect(result).toContain('rdy run --from .');
    expect(result).toContain('default');
    expect(result).toContain('deploy');
  });

  it('preserves the exact fromArg in the hint', () => {
    const result = formatConsumerView({
      compiledKits: [{ name: 'deploy' }],
      fromArg: '/other',
      kitsDir: '/other/.readyup/kits',
    });

    expect(result).toContain('rdy run --from /other');
  });

  it('uses brackets around positional name when default kit exists', () => {
    const result = formatConsumerView({
      compiledKits: [{ name: 'default' }],
      fromArg: '.',
      kitsDir: '/resolved/.readyup/kits',
    });

    expect(result).toContain('rdy run --from . [<kit>[:<checklist>,...]]');
  });

  it('omits brackets around positional name when default kit is absent', () => {
    const result = formatConsumerView({
      compiledKits: [{ name: 'deploy' }],
      fromArg: '.',
      kitsDir: '/resolved/.readyup/kits',
    });

    expect(result).toContain('rdy run --from . <kit>[:<checklist>,...]');
    expect(result).not.toContain('[<kit>[:<checklist>,...]]');
  });

  it('nests each kit\u{2019}s checklists beneath it', () => {
    const result = formatConsumerView({
      compiledKits: [{ name: 'deploy', checklists: ['build', 'release'] }],
      fromArg: '.',
      kitsDir: '/resolved/.readyup/kits',
    });

    expect(result).toContain(`${COMPILED} deploy\n   ${CHECKLIST} build\n   ${CHECKLIST} release`);
  });

  it('returns empty message with resolved kitsDir for local path', () => {
    const result = formatConsumerView({
      compiledKits: [],
      fromArg: '.',
      kitsDir: '/resolved/.readyup/kits',
    });

    expect(result).toBe('No compiled kits found at /resolved/.readyup/kits.');
  });

  it('returns empty message with home-based path for global source', () => {
    const result = formatConsumerView({
      compiledKits: [],
      fromArg: 'global',
      kitsDir: '/home/user/.readyup/kits',
    });

    expect(result).toBe('No compiled kits found at /home/user/.readyup/kits.');
  });

  it('returns empty message with directory path for dir: source', () => {
    const result = formatConsumerView({
      compiledKits: [],
      fromArg: 'dir:/custom/path',
      kitsDir: '/custom/path',
    });

    expect(result).toBe('No compiled kits found at /custom/path.');
  });
});

describe(resolveCompiledStyle, () => {
  it('reports the local convention when outDir is the default kits directory', () => {
    const style = resolveCompiledStyle('/repo', '.readyup/kits', '/repo');

    expect(style).toStrictEqual({ kind: 'local-convention' });
  });

  it('reports a custom outDir relative to the directory being rendered from', () => {
    const style = resolveCompiledStyle('/repo', 'dist/kits', '/repo');

    expect(style).toStrictEqual({ kind: 'custom-outDir', outDirRel: path.join('dist', 'kits') });
  });

  it('settles the convention against the project while naming the path against the sweep root', () => {
    const style = resolveCompiledStyle('/repo/packages/tooling', 'dist/kits', '/repo');

    expect(style).toStrictEqual({ kind: 'custom-outDir', outDirRel: path.join('packages/tooling/dist/kits') });
  });

  it('reports the local convention for a nested project on the default outDir', () => {
    const style = resolveCompiledStyle('/repo/packages/ui', '.readyup/kits', '/repo');

    expect(style).toStrictEqual({ kind: 'local-convention' });
  });
});

describe(formatEmpty, () => {
  it('returns owner message for owner mode', () => {
    const result = formatEmpty('owner');

    expect(result).toContain('rdy init');
    expect(result).toContain('rdy compile');
  });

  it('returns the empty-sweep message for recursive mode', () => {
    expect(formatEmpty('recursive')).toBe('No kit projects found.');
  });

  it('returns the empty-sweep message for repo-wide dependency mode', () => {
    expect(formatEmpty('recursive-sources')).toBe(
      'No dependency or configured source of any project below this directory publishes kits.',
    );
  });

  it('returns consumer message with the provided kitsDir', () => {
    const result = formatEmpty('consumer', '/home/user/.readyup/kits');

    expect(result).toBe('No compiled kits found at /home/user/.readyup/kits.');
  });

  it('defaults consumer kitsDir to ".readyup/kits" when omitted', () => {
    const result = formatEmpty('consumer');

    expect(result).toBe('No compiled kits found at .readyup/kits.');
  });
});

describe('check names', () => {
  it('nests each checklist\u{2019}s check names beneath it under showChecks', () => {
    const lines = formatOwnerView({ internalKits: [], compiledKits: [RECORDED_KIT], showChecks: true }).split('\n');

    expect(lines.slice(2)).toStrictEqual(RECORDED_KIT_LINES);
  });

  it('omits recorded check names without showChecks', () => {
    const result = formatOwnerView({ internalKits: [], compiledKits: [RECORDED_KIT] });

    expect(result).not.toContain(CHECK);
    expect(result).not.toContain('not recorded');
  });

  it('notes a kit whose manifest does not record its check names, after its description', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [{ name: 'legacy', description: 'Older kit', checklists: ['setup'] }],
      showChecks: true,
    });

    expect(result).toContain(
      `${COMPILED} legacy \u{00B7} Older kit (checks not recorded; recompile to record them)\n   ${CHECKLIST} setup`,
    );
  });

  it('notes an undescribed kit whose manifest does not record its check names', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [{ name: 'legacy', checklists: ['setup'] }],
      showChecks: true,
    });

    expect(result).toContain(`${COMPILED} legacy \u{00B7} (checks not recorded; recompile to record them)`);
  });

  it('does not note a kit that records no checklists', () => {
    const result = formatOwnerView({ internalKits: [], compiledKits: [{ name: 'bare' }], showChecks: true });

    expect(result).not.toContain('not recorded');
  });

  it('renders check names in the consumer view', () => {
    const result = formatConsumerView({ compiledKits: [RECORDED_KIT], fromArg: '.', kitsDir: '.', showChecks: true });

    expect(result).toContain(RECORDED_KIT_LINES.join('\n'));
  });

  it('renders check names in the manifest view', () => {
    const result = formatManifestView({ kits: [RECORDED_KIT], manifestPath: 'manifest.json', showChecks: true });

    expect(result).toContain(RECORDED_KIT_LINES.join('\n'));
  });

  it('renders check names in the recursive view', () => {
    const result = formatRecursiveView({
      projects: [{ dir: '.', compiledKits: [RECORDED_KIT], compiledStyle: { kind: 'local-convention' } }],
      showChecks: true,
    });

    expect(result).toContain(RECORDED_KIT_LINES.join('\n'));
  });

  it('renders check names in the sources view', () => {
    const result = formatSourcesView({ groups: [buildRecordedGroup()], showChecks: true });

    expect(result).toContain(RECORDED_KIT_LINES.join('\n'));
  });

  it('renders check names two levels deeper in the repo-wide sources view', () => {
    const result = formatRecursiveSourcesView({
      projects: [buildProjectSources({ dir: '.', groups: [buildRecordedGroup()] })],
      showChecks: true,
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

/**
 * Returns the line beneath a section's title, which contains its command.
 *
 * Reading that line positionally is the assertion: A command fused into the title would still satisfy a
 * `toContain` over the whole output.
 */
function findSectionCommand(output: string, title: string): string | undefined {
  const lines = output.split('\n');
  const titleIndex = lines.indexOf(`\u{2500}\u{2500} ${title}`);
  return titleIndex === -1 ? undefined : lines[titleIndex + 1];
}

// endregion | Helpers
