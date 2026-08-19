import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { KitPackageGroup } from '../../installed-packages/collectKitPackageGroups.ts';
import type { PackageKit } from '../../installed-packages/expandConfiguredPackages.ts';
import { setStyle } from '../../layout/engine.ts';
import { richFormatter } from '../../layout/richFormatter.ts';
import {
  formatConsumerView,
  formatEmpty,
  formatManifestView,
  formatOwnerView,
  formatPackagesView,
  formatRecursivePackagesView,
  formatRecursiveView,
  type ProjectPackagesView,
  type RecursiveProjectView,
  resolveCompiledStyle,
} from '../formatList.ts';
import { findPackageCommand } from '../test-utils/findPackageCommand.ts';

const COMPILED = richFormatter.tokens.kit.glyph;
const INTERNAL = richFormatter.tokens.kitSource.glyph;
const DIRECTORY = richFormatter.tokens.sourceDirectory.glyph;
const PACKAGE = richFormatter.tokens.sourcePackage.glyph;

describe(formatOwnerView, () => {
  it('renders only the Internal section when compiled kits are empty', () => {
    const result = formatOwnerView({
      internalKits: ['default', 'deploy'],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).toContain('\u{2500}\u{2500} Internal');
    expect(result).not.toContain('\u{2500}\u{2500} Compiled');
    expect(result).toContain('deploy');
  });

  it('omits --internal from the internal hint by default', () => {
    const result = formatOwnerView({
      internalKits: ['default'],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(findSectionCommand(result, 'Internal')).toBe('   To run: rdy run --jit [<name>]');
  });

  it('adds --internal to the internal hint when the config makes it necessary', () => {
    const result = formatOwnerView({
      internalKits: ['default'],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
      needsInternalFlag: true,
    });

    expect(findSectionCommand(result, 'Internal')).toBe('   To run: rdy run --jit --internal [<name>]');
  });

  it('renders only the Compiled section when internal kits are empty', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: ['deploy'],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).not.toContain('\u{2500}\u{2500} Internal');
    expect(result).toContain('\u{2500}\u{2500} Compiled');
    expect(result).toContain('deploy');
  });

  it('splits the section title from its command onto two lines', () => {
    const result = formatOwnerView({
      internalKits: ['deploy'],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
    });
    const lines = result.split('\n');

    expect(lines[0]).toBe('\u{2500}\u{2500} Internal');
    expect(lines[1]).toBe('   To run: rdy run --jit <name>');
    expect(lines[2]).toBe(`${INTERNAL} deploy`);
  });

  // A blank parts one section from the next, and the first section opens the output with no blank at all.
  it('parts one section from the next with a blank line, opening with none', () => {
    const lines = formatOwnerView({
      internalKits: ['deploy'],
      compiledKits: ['monitor'],
      compiledStyle: { kind: 'local-convention' },
    }).split('\n');
    const titleIndexes = lines
      .map((line, index) => (line.startsWith('\u{2500}\u{2500} ') ? index : -1))
      .filter((index) => index !== -1);

    expect(titleIndexes).toStrictEqual([0, 4]);
    expect(lines[3]).toBe('');
  });

  it('fuses neither the command into the title nor the title into the command', () => {
    const result = formatOwnerView({
      internalKits: ['deploy'],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).not.toContain('Internal: rdy run');
  });

  it('uses brackets around positional name in internal hint when default exists', () => {
    const result = formatOwnerView({
      internalKits: ['default'],
      compiledKits: ['deploy'],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(findSectionCommand(result, 'Internal')).toBe('   To run: rdy run --jit [<name>]');
    expect(findSectionCommand(result, 'Compiled')).toBe('   To run: rdy run <name>');
  });

  it('uses brackets in compiled hint when default is in compiled kits', () => {
    const result = formatOwnerView({
      internalKits: ['deploy'],
      compiledKits: ['default', 'monitor'],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(findSectionCommand(result, 'Internal')).toBe('   To run: rdy run --jit <name>');
    expect(findSectionCommand(result, 'Compiled')).toBe('   To run: rdy run [<name>]');
  });

  it('omits brackets around positional name when no default kit exists', () => {
    const result = formatOwnerView({
      internalKits: ['deploy'],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).toContain('rdy run --jit <name>');
    expect(result).not.toContain('[<name>]');
  });

  it('includes --jit in internal hints but not compiled hints', () => {
    const result = formatOwnerView({
      internalKits: ['default'],
      compiledKits: ['deploy'],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(findSectionCommand(result, 'Internal')).toContain('--jit');
    expect(findSectionCommand(result, 'Compiled')).not.toContain('--jit');
  });

  // Discovery is not run selection, so the rows list every published kit and the optional name reaches each.
  it('heads the Packages section with the optional-name form of the run command', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
      packageKits: ['default', 'npm-auto-publish'],
    });

    expect(findSectionCommand(result, 'Packages')).toBe('   To run: rdy run --packages [<name>]');
    expect(result).toContain('default');
    expect(result).toContain('npm-auto-publish');
  });

  // The section heads what to do about these packages, not a command, so the run label would misname it.
  it('heads the Available section with its instruction, unlabelled', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
      availablePackages: ['@acme/release-kit'],
    });

    expect(findSectionCommand(result, 'Available')).toBe('   Add to "packages" in the readyup config');
  });

  it('renders custom outDir style with file paths', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: ['deploy', 'monitor'],
      compiledStyle: { kind: 'custom-outDir', outDirRel: 'dist/kits' },
    });

    expect(result).toContain('rdy run --file <file path>');
    expect(result).toContain('dist/kits/deploy.js');
    expect(result).toContain('dist/kits/monitor.js');
  });

  it('returns empty-owner message when both lists are empty', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).toBe(
      'No kits found.\nRun `rdy init` to scaffold an internal kit or `rdy compile` to compile a kit from source.',
    );
  });

  it('renders both sections when both have kits', () => {
    const result = formatOwnerView({
      internalKits: ['default'],
      compiledKits: ['deploy'],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).toContain('\u{2500}\u{2500} Internal');
    expect(result).toContain('\u{2500}\u{2500} Compiled');
  });
});

describe(formatConsumerView, () => {
  it('renders compiled kits with the from arg in the hint', () => {
    const result = formatConsumerView({
      compiledKits: ['default', 'deploy'],
      fromArg: '.',
      kitsDir: '/resolved/.readyup/kits',
    });

    expect(result).toContain('rdy run --from .');
    expect(result).toContain('default');
    expect(result).toContain('deploy');
  });

  it('preserves the exact fromArg in the hint', () => {
    const result = formatConsumerView({
      compiledKits: ['deploy'],
      fromArg: '/other',
      kitsDir: '/other/.readyup/kits',
    });

    expect(result).toContain('rdy run --from /other');
  });

  it('uses brackets around positional name when default kit exists', () => {
    const result = formatConsumerView({
      compiledKits: ['default'],
      fromArg: '.',
      kitsDir: '/resolved/.readyup/kits',
    });

    expect(result).toContain('rdy run --from . [<name>]');
  });

  it('omits brackets around positional name when default kit is absent', () => {
    const result = formatConsumerView({
      compiledKits: ['deploy'],
      fromArg: '.',
      kitsDir: '/resolved/.readyup/kits',
    });

    expect(result).toContain('rdy run --from . <name>');
    expect(result).not.toContain('[<name>]');
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

describe(formatManifestView, () => {
  it('renders kit names with the kit icon', () => {
    const result = formatManifestView({
      kits: [{ name: 'deploy' }, { name: 'monitor' }],
      manifestPath: '.readyup/manifest.json',
    });

    expect(result).toContain('\u{2500}\u{2500} Manifest: .readyup/manifest.json');
    expect(result).toContain(`${COMPILED} deploy`);
    expect(result).toContain(`${COMPILED} monitor`);
  });

  it('sits the kits against the heading, with no blank line anywhere', () => {
    const lines = formatManifestView({
      kits: [{ name: 'deploy' }],
      manifestPath: '.readyup/manifest.json',
    }).split('\n');

    expect(lines[0]).toBe('\u{2500}\u{2500} Manifest: .readyup/manifest.json');
    expect(lines[1]).toBe(`${COMPILED} deploy`);
  });

  it('renders description inline after kit name when present', () => {
    const result = formatManifestView({
      kits: [{ name: 'default', description: 'General project health checks' }],
      manifestPath: '.readyup/manifest.json',
    });

    expect(result).toContain(`${COMPILED} default \u{00B7} General project health checks`);
  });

  it('omits description suffix when description is absent', () => {
    const result = formatManifestView({
      kits: [{ name: 'deploy' }],
      manifestPath: '.readyup/manifest.json',
    });

    const lines = result.split('\n');
    const kitLine = lines.find((l) => l.includes('deploy'));
    expect(kitLine).toBe(`${COMPILED} deploy`);
  });

  it('returns empty-manifest message when kits array is empty', () => {
    const result = formatManifestView({
      kits: [],
      manifestPath: '.readyup/manifest.json',
    });

    expect(result).toBe('No kits found in manifest: .readyup/manifest.json');
  });

  it('renders readyup version as a parenthetical between name and description', () => {
    const result = formatManifestView({
      kits: [{ name: 'default', description: 'General project health checks', readyupVersion: '0.20.0' }],
      manifestPath: '.readyup/manifest.json',
    });

    expect(result).toContain(`${COMPILED} default (readyup v0.20.0) \u{00B7} General project health checks`);
  });

  it('renders version-only parenthetical when description is absent', () => {
    const result = formatManifestView({
      kits: [{ name: 'deploy', readyupVersion: '0.19.2' }],
      manifestPath: '.readyup/manifest.json',
    });

    const lines = result.split('\n');
    const kitLine = lines.find((l) => l.includes('deploy'));
    expect(kitLine).toBe(`${COMPILED} deploy (readyup v0.19.2)`);
  });

  it('omits the version parenthetical entirely when readyupVersion is absent', () => {
    const result = formatManifestView({
      kits: [{ name: 'legacy', description: 'Older kit' }],
      manifestPath: '.readyup/manifest.json',
    });

    expect(result).toContain(`${COMPILED} legacy \u{00B7} Older kit`);
    expect(result).not.toContain('readyup v');
  });

  it('omits both segments when both version and description are absent', () => {
    const result = formatManifestView({
      kits: [{ name: 'bare' }],
      manifestPath: '.readyup/manifest.json',
    });

    const lines = result.split('\n');
    const kitLine = lines.find((l) => l.includes('bare'));
    expect(kitLine).toBe(`${COMPILED} bare`);
  });
});

describe(formatPackagesView, () => {
  it('heads each package with its name and version', () => {
    const result = formatPackagesView({
      groups: [buildGroup({ packageName: '@acme/kits', version: '2.1.0', kits: ['drift'] })],
    });

    expect(result).toContain(`\u{2501}\u{2501} ${PACKAGE} @acme/kits@2.1.0`);
  });

  // Built inline rather than through the helper, whose default would fill the version back in.
  it('heads a package that declares no version with its name alone', () => {
    const result = formatPackagesView({
      groups: [
        {
          packageName: 'plain-kit',
          version: undefined,
          configured: true,
          kits: [buildKit('plain-kit', 'smoke', undefined)],
        },
      ],
    });

    expect(result).toContain(`\u{2501}\u{2501} ${PACKAGE} plain-kit\n`);
  });

  it('hints a configured package with the run that reaches it', () => {
    const result = formatPackagesView({ groups: [buildGroup({ packageName: '@acme/kits', kits: ['drift'] })] });

    expect(findPackageCommand(result, '@acme/kits@2.1.0')).toBe('   To run: rdy run --packages <name>');
  });

  // The hint is what tells the reader a `--packages` run would skip this package.
  it('hints an unconfigured package with the source that names it directly', () => {
    const result = formatPackagesView({
      groups: [buildGroup({ packageName: '@acme/kits', configured: false, kits: ['drift'] })],
    });

    expect(findPackageCommand(result, '@acme/kits@2.1.0')).toBe('   To run: rdy run --from npm:@acme/kits <name>');
  });

  it('brackets the positional name when the package publishes a default kit', () => {
    const result = formatPackagesView({
      groups: [buildGroup({ packageName: '@acme/kits', kits: ['default', 'drift'] })],
    });

    expect(findPackageCommand(result, '@acme/kits@2.1.0')).toBe('   To run: rdy run --packages [<name>]');
  });

  it('marks an unconfigured package and leaves a configured one unmarked', () => {
    const result = formatPackagesView({
      groups: [
        buildGroup({ packageName: '@acme/kits', configured: false, kits: ['drift'] }),
        buildGroup({ packageName: 'plain-kit', kits: ['smoke'] }),
      ],
    });

    expect(result).toContain(`\u{2501}\u{2501} ${PACKAGE} @acme/kits@2.1.0 \u{00B7} not listed in the readyup config`);
    expect(result).toContain(`\u{2501}\u{2501} ${PACKAGE} plain-kit@2.1.0\n`);
  });

  it('renders a description as inline detail, and a kit without one as the bare name', () => {
    const result = formatPackagesView({
      groups: [
        {
          packageName: '@acme/kits',
          version: '2.1.0',
          configured: true,
          kits: [buildKit('@acme/kits', 'drift', 'Dependency drift'), buildKit('@acme/kits', 'preflight', undefined)],
        },
      ],
    });

    expect(result).toContain(`${COMPILED} drift \u{00B7} Dependency drift`);
    expect(result).toContain(`${COMPILED} preflight`);
    expect(result).not.toContain('preflight \u{00B7}');
  });

  it('parts one package block from the next with a blank line', () => {
    const result = formatPackagesView({
      groups: [
        buildGroup({ packageName: '@acme/kits', kits: ['drift'] }),
        buildGroup({ packageName: 'plain-kit', kits: ['smoke'] }),
      ],
    });

    expect(result).toContain(`${COMPILED} drift\n\n\u{2501}\u{2501} ${PACKAGE} plain-kit@2.1.0`);
  });

  it('reports the empty-packages message when nothing publishes kits', () => {
    expect(formatPackagesView({ groups: [] })).toBe('No installed dependency publishes kits.');
  });
});

describe(formatRecursiveView, () => {
  afterEach(() => {
    setStyle('rich');
  });

  it('heads each project with its directory, carrying a trailing slash', () => {
    const result = formatRecursiveView({
      projects: [buildProject({ dir: '.', kits: ['demo'] }), buildProject({ dir: 'packages/ui', kits: ['deploy'] })],
    });

    expect(result).toContain(`\u{2501}\u{2501} ${DIRECTORY} ./`);
    expect(result).toContain(`\u{2501}\u{2501} ${DIRECTORY} packages/ui/`);
  });

  it('renders the sweep root with a hint naming no project', () => {
    const result = formatRecursiveView({ projects: [buildProject({ dir: '.', kits: ['demo'] })] });

    expect(findProjectCommand(result, './')).toBe('   To run: rdy run <name>');
  });

  it('renders another project with a hint naming it', () => {
    const result = formatRecursiveView({ projects: [buildProject({ dir: 'packages/ui', kits: ['deploy'] })] });

    expect(findProjectCommand(result, 'packages/ui/')).toBe('   To run: rdy run --from packages/ui <name>');
  });

  it('brackets the positional name when the project holds a default kit', () => {
    const result = formatRecursiveView({ projects: [buildProject({ dir: 'packages/ui', kits: ['default'] })] });

    expect(findProjectCommand(result, 'packages/ui/')).toBe('   To run: rdy run --from packages/ui [<name>]');
  });

  it('renders a description as inline detail, and a kit without one as the bare name', () => {
    const result = formatRecursiveView({
      projects: [
        {
          dir: 'packages/ui',
          compiledKits: [{ name: 'default', description: 'Publication readiness' }, { name: 'deploy' }],
          compiledStyle: { kind: 'local-convention' },
        },
      ],
    });

    expect(result).toContain(`${COMPILED} default \u{00B7} Publication readiness`);
    expect(result).toContain(`${COMPILED} deploy`);
    expect(result).not.toContain('deploy \u{00B7}');
  });

  it('renders a custom-outDir project by file path, against the sweep root', () => {
    const result = formatRecursiveView({
      projects: [
        {
          dir: 'packages/tooling',
          compiledKits: [{ name: 'lint', description: 'Shared lint and format gate' }],
          compiledStyle: { kind: 'custom-outDir', outDirRel: 'packages/tooling/dist/kits' },
        },
      ],
    });

    expect(findProjectCommand(result, 'packages/tooling/')).toBe('   To run: rdy run --file <file path>');
    expect(result).toContain(`${COMPILED} packages/tooling/dist/kits/lint.js \u{00B7} Shared lint and format gate`);
  });

  it('omits a project with no compiled kits, its heading included', () => {
    const result = formatRecursiveView({
      projects: [buildProject({ dir: '.', kits: ['demo'] }), buildProject({ dir: 'packages/authored', kits: [] })],
    });

    expect(result).not.toContain('packages/authored');
    expect(result).toContain('demo');
  });

  it('parts one project block from the next with a blank line, opening with none', () => {
    const lines = formatRecursiveView({
      projects: [buildProject({ dir: '.', kits: ['demo'] }), buildProject({ dir: 'packages/ui', kits: ['deploy'] })],
    }).split('\n');

    expect(lines[0]).toBe(`\u{2501}\u{2501} ${DIRECTORY} ./`);
    expect(lines[3]).toBe('');
    expect(lines[4]).toBe(`\u{2501}\u{2501} ${DIRECTORY} packages/ui/`);
  });

  it('renders projects in the order they are given', () => {
    const result = formatRecursiveView({
      projects: [
        buildProject({ dir: '.', kits: ['demo'] }),
        buildProject({ dir: 'packages/a', kits: ['first'] }),
        buildProject({ dir: 'packages/b', kits: ['second'] }),
      ],
    });

    expect(result.indexOf('packages/a/')).toBeLessThan(result.indexOf('packages/b/'));
    expect(result.indexOf('./')).toBeLessThan(result.indexOf('packages/a/'));
  });

  it('returns the empty-sweep message when no project has compiled kits', () => {
    const result = formatRecursiveView({ projects: [buildProject({ dir: 'packages/authored', kits: [] })] });

    expect(result).toBe('No kit projects found.');
  });

  it('returns the empty-sweep message for a sweep that found no project at all', () => {
    expect(formatRecursiveView({ projects: [] })).toBe('No kit projects found.');
  });

  it('degrades to ASCII rules and an unglyphed heading in plain style', () => {
    setStyle('plain');

    const lines = formatRecursiveView({ projects: [buildProject({ dir: 'packages/ui', kits: ['deploy'] })] }).split(
      '\n',
    );

    expect(lines[0]).toBe('== packages/ui/');
    expect(lines[1]).toBe('      To run: rdy run --from packages/ui <name>');
    expect(lines[2]).toBe('      deploy');
  });
});

describe(formatRecursivePackagesView, () => {
  afterEach(() => {
    setStyle('rich');
  });

  it('heads each project with its directory and nests a line per publishing dependency', () => {
    const result = formatRecursivePackagesView({
      projects: [
        buildProjectPackages({ dir: '.', groups: [buildGroup({ packageName: '@acme/kits', kits: ['drift'] })] }),
        buildProjectPackages({
          dir: 'packages/tooling',
          groups: [buildGroup({ packageName: 'plain-kit', kits: ['smoke'] })],
        }),
      ],
    });

    expect(result.split('\n')).toStrictEqual([
      `${DIRECTORY} ./`,
      `   ${PACKAGE} @acme/kits@2.1.0`,
      '      To run: rdy run --packages <name>',
      `      ${COMPILED} drift`,
      '',
      `${DIRECTORY} packages/tooling/`,
      `   ${PACKAGE} plain-kit@2.1.0`,
      '      To run: cd packages/tooling && rdy run --packages <name>',
      `      ${COMPILED} smoke`,
    ]);
  });

  // The command has to run the kits beneath it from wherever the sweep was run.
  it('reaches a workspace dependency by changing into the workspace that declares it', () => {
    const result = formatRecursivePackagesView({
      projects: [
        buildProjectPackages({
          dir: 'packages/tooling',
          groups: [buildGroup({ packageName: '@acme/kits', configured: false, kits: ['drift'] })],
        }),
      ],
    });

    expect(result).toContain('To run: cd packages/tooling && rdy run --from npm:@acme/kits <name>');
  });

  it('marks a package the project config omits', () => {
    const result = formatRecursivePackagesView({
      projects: [
        buildProjectPackages({
          dir: '.',
          groups: [
            buildGroup({ packageName: '@acme/kits', configured: false, kits: ['drift'] }),
            buildGroup({ packageName: 'plain-kit', kits: ['smoke'] }),
          ],
        }),
      ],
    });

    expect(result).toContain(`${PACKAGE} @acme/kits@2.1.0 \u{00B7} not listed in the readyup config`);
    expect(result).toContain(`${PACKAGE} plain-kit@2.1.0\n`);
  });

  it('renders a kit description as inline detail', () => {
    const result = formatRecursivePackagesView({
      projects: [
        buildProjectPackages({
          dir: '.',
          groups: [
            {
              packageName: '@acme/kits',
              version: '2.1.0',
              configured: true,
              kits: [buildKit('@acme/kits', 'drift', 'Dependency drift')],
            },
          ],
        }),
      ],
    });

    expect(result).toContain(`${COMPILED} drift \u{00B7} Dependency drift`);
  });

  it('parts one package from the next with a blank line, and keeps the directory against its first', () => {
    const result = formatRecursivePackagesView({
      projects: [
        buildProjectPackages({
          dir: '.',
          groups: [
            buildGroup({ packageName: '@acme/kits', kits: ['drift'] }),
            buildGroup({ packageName: 'plain-kit', kits: ['smoke'] }),
          ],
        }),
      ],
    });

    expect(result).toContain(`${DIRECTORY} ./\n   ${PACKAGE} @acme/kits@2.1.0`);
    expect(result).toContain(`${COMPILED} drift\n\n   ${PACKAGE} plain-kit@2.1.0`);
  });

  it('omits a project whose sweep found no publishing dependency, its directory included', () => {
    const result = formatRecursivePackagesView({
      projects: [
        buildProjectPackages({ dir: '.', groups: [buildGroup({ packageName: '@acme/kits', kits: ['drift'] })] }),
        buildProjectPackages({ dir: 'packages/plain', groups: [] }),
      ],
    });

    expect(result).not.toContain('packages/plain');
  });

  it('returns the empty message for a sweep that found no publishing dependency anywhere', () => {
    const result = formatRecursivePackagesView({ projects: [buildProjectPackages({ dir: '.', groups: [] })] });

    expect(result).toBe('No dependency of any project below this directory publishes kits.');
  });

  // Plain style gives the role tokens no glyph, so the indent is all that separates the three levels.
  it('separates directory, package, and kit by indentation alone in plain style', () => {
    setStyle('plain');

    const result = formatRecursivePackagesView({
      projects: [
        buildProjectPackages({
          dir: 'packages/tooling',
          groups: [buildGroup({ packageName: 'plain-kit', kits: ['smoke'] })],
        }),
      ],
    });

    expect(result.split('\n')).toStrictEqual([
      '      packages/tooling/',
      '            plain-kit@2.1.0',
      '            To run: cd packages/tooling && rdy run --packages <name>',
      '                  smoke',
    ]);
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
    expect(formatEmpty('recursive-packages')).toBe('No dependency of any project below this directory publishes kits.');
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

// region | Helpers

/**
 * Builds a configured package group holding the named kits, each undescribed.
 *
 * `version` defaults to `2.1.0`, which an explicit `undefined` takes as well: a group naming no version
 * is built inline.
 */
function buildGroup({
  packageName,
  version = '2.1.0',
  configured = true,
  kits,
}: {
  packageName: string;
  version?: string | undefined;
  configured?: boolean;
  kits: string[];
}): KitPackageGroup {
  return {
    packageName,
    version,
    configured,
    kits: kits.map((kitName) => buildKit(packageName, kitName, undefined)),
  };
}

/** Builds one published kit, whose path the packages view never renders. */
function buildKit(packageName: string, kitName: string, description: string | undefined): PackageKit {
  return {
    packageName,
    version: '2.1.0',
    kitName,
    description,
    path: `node_modules/${packageName}/.readyup/kits/${kitName}.js`,
  };
}

/** Builds a project on the default outDir, holding the named kits and no descriptions. */
function buildProject({ dir, kits }: { dir: string; kits: string[] }): RecursiveProjectView {
  return {
    dir,
    compiledKits: kits.map((name) => ({ name })),
    compiledStyle: { kind: 'local-convention' },
  };
}

/** Builds one project's contribution to a repo-wide dependency listing. */
function buildProjectPackages({ dir, groups }: { dir: string; groups: KitPackageGroup[] }): ProjectPackagesView {
  return { dir, groups };
}

/** Returns the line beneath a project's heading, which is where its command sits. */
function findProjectCommand(output: string, heading: string): string | undefined {
  const lines = output.split('\n');
  const headingIndex = lines.findIndex((line) => line.endsWith(` ${heading}`));
  return headingIndex === -1 ? undefined : lines[headingIndex + 1];
}

/**
 * Returns the line beneath a section's title, which is where its command sits.
 *
 * Reading that line positionally is the assertion: a command fused into the title would still satisfy a
 * `toContain` over the whole output.
 */
function findSectionCommand(output: string, title: string): string | undefined {
  const lines = output.split('\n');
  const titleIndex = lines.indexOf(`\u{2500}\u{2500} ${title}`);
  return titleIndex === -1 ? undefined : lines[titleIndex + 1];
}

// endregion | Helpers
