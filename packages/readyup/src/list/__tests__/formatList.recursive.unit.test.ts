import { afterEach, describe, expect, it } from 'vitest';

import { setStyle } from '../../layout/engine.ts';
import { richFormatter } from '../../layout/formatter.ts';
import { formatRecursiveSourcesView, formatRecursiveView, type RecursiveProjectView } from '../formatList.ts';
import { buildGroup, buildKit, buildProjectSources } from '../test-utils/source-group-fixtures.ts';

const COMPILED = richFormatter.tokens.kit.text;
const DIRECTORY = richFormatter.tokens.sourceDirectory.text;
const PACKAGE = richFormatter.tokens.sourcePackage.text;
const CHECKLIST = richFormatter.tokens.checklist.text;

describe(formatRecursiveView, () => {
  afterEach(() => {
    setStyle('rich');
  });

  it('heads each project with its directory, with a trailing slash', () => {
    const result = formatRecursiveView({
      projects: [buildProject({ dir: '.', kits: ['demo'] }), buildProject({ dir: 'packages/ui', kits: ['deploy'] })],
    });

    expect(result).toContain(`\u{2501}\u{2501} ${DIRECTORY} ./`);
    expect(result).toContain(`\u{2501}\u{2501} ${DIRECTORY} packages/ui/`);
  });

  it('renders the sweep root with a hint naming no project', () => {
    const result = formatRecursiveView({ projects: [buildProject({ dir: '.', kits: ['demo'] })] });

    expect(findProjectCommand(result, './')).toBe('   To run: rdy run <kit>[:<checklist>,...]');
  });

  it('renders another project with a hint naming it', () => {
    const result = formatRecursiveView({ projects: [buildProject({ dir: 'packages/ui', kits: ['deploy'] })] });

    expect(findProjectCommand(result, 'packages/ui/')).toBe(
      '   To run: rdy run --from packages/ui <kit>[:<checklist>,...]',
    );
  });

  it('brackets the positional name when the project contains a default kit', () => {
    const result = formatRecursiveView({ projects: [buildProject({ dir: 'packages/ui', kits: ['default'] })] });

    expect(findProjectCommand(result, 'packages/ui/')).toBe(
      '   To run: rdy run --from packages/ui [<kit>[:<checklist>,...]]',
    );
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

  it('nests a kit\u{2019}s checklists beneath it', () => {
    const result = formatRecursiveView({
      projects: [
        {
          dir: 'packages/ui',
          compiledKits: [{ name: 'default', description: 'Publication readiness', checklists: ['packaging'] }],
          compiledStyle: { kind: 'local-convention' },
        },
      ],
    });

    expect(result).toContain(`${COMPILED} default \u{00B7} Publication readiness\n   ${CHECKLIST} packaging`);
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

    expect(findProjectCommand(result, 'packages/tooling/')).toBe(
      '   To run: rdy run --file <file path> [--checklists <checklist>,...]',
    );
    expect(result).toContain(`${COMPILED} packages/tooling/dist/kits/lint.js \u{00B7} Shared lint and format gate`);
  });

  it('omits a project with no compiled kits, its heading included', () => {
    const result = formatRecursiveView({
      projects: [buildProject({ dir: '.', kits: ['demo'] }), buildProject({ dir: 'packages/authored', kits: [] })],
    });

    expect(result).not.toContain('packages/authored');
    expect(result).toContain('demo');
  });

  it('separates one project block from the next with a blank line, opening with none', () => {
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
    expect(lines[1]).toBe('      To run: rdy run --from packages/ui <kit>[:<checklist>,...]');
    expect(lines[2]).toBe('      deploy');
  });
});

describe(formatRecursiveSourcesView, () => {
  afterEach(() => {
    setStyle('rich');
  });

  it('heads each project with its directory and nests a line per publishing dependency', () => {
    const result = formatRecursiveSourcesView({
      projects: [
        buildProjectSources({ dir: '.', groups: [buildGroup({ packageName: '@acme/kits', kits: ['drift'] })] }),
        buildProjectSources({
          dir: 'packages/tooling',
          groups: [buildGroup({ packageName: 'plain-kit', kits: ['smoke'] })],
        }),
      ],
    });

    expect(result.split('\n')).toStrictEqual([
      `${DIRECTORY} ./`,
      `   ${PACKAGE} @acme/kits@2.1.0`,
      '      To run: rdy run --sources <kit>',
      `      ${COMPILED} drift`,
      '',
      `${DIRECTORY} packages/tooling/`,
      `   ${PACKAGE} plain-kit@2.1.0`,
      '      To run: cd packages/tooling && rdy run --sources <kit>',
      `      ${COMPILED} smoke`,
    ]);
  });

  // The command has to run the kits beneath it from wherever the sweep was run.
  it('runs the kits of a workspace dependency by changing into the workspace that declares it', () => {
    const result = formatRecursiveSourcesView({
      projects: [
        buildProjectSources({
          dir: 'packages/tooling',
          groups: [buildGroup({ packageName: '@acme/kits', configured: false, kits: ['drift'] })],
        }),
      ],
    });

    expect(result).toContain('To run: cd packages/tooling && rdy run --from npm:@acme/kits <kit>[:<checklist>,...]');
  });

  it('marks a package omitted by the project config', () => {
    const result = formatRecursiveSourcesView({
      projects: [
        buildProjectSources({
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
    const result = formatRecursiveSourcesView({
      projects: [
        buildProjectSources({
          dir: '.',
          groups: [
            {
              kind: 'package',
              source: 'npm:@acme/kits',
              name: '@acme/kits',
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

  it('nests a kit\u{2019}s checklists one level beneath the kit', () => {
    const result = formatRecursiveSourcesView({
      projects: [
        buildProjectSources({
          dir: '.',
          groups: [
            {
              kind: 'package',
              source: 'npm:@acme/kits',
              name: '@acme/kits',
              version: '2.1.0',
              configured: true,
              kits: [buildKit('@acme/kits', 'drift', undefined, ['lockfile'])],
            },
          ],
        }),
      ],
    });

    expect(result).toContain(`      ${COMPILED} drift\n         ${CHECKLIST} lockfile`);
  });

  it('separates one package from the next with a blank line, and keeps the directory against its first', () => {
    const result = formatRecursiveSourcesView({
      projects: [
        buildProjectSources({
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
    const result = formatRecursiveSourcesView({
      projects: [
        buildProjectSources({ dir: '.', groups: [buildGroup({ packageName: '@acme/kits', kits: ['drift'] })] }),
        buildProjectSources({ dir: 'packages/plain', groups: [] }),
      ],
    });

    expect(result).not.toContain('packages/plain');
  });

  it('returns the empty message for a sweep that found no publishing dependency anywhere', () => {
    const result = formatRecursiveSourcesView({ projects: [buildProjectSources({ dir: '.', groups: [] })] });

    expect(result).toBe('No dependency or configured source of any project below this directory publishes kits.');
  });

  // Plain style gives the role tokens no glyph, so the indent is all that separates the three levels.
  it('separates directory, package, and kit by indentation alone in plain style', () => {
    setStyle('plain');

    const result = formatRecursiveSourcesView({
      projects: [
        buildProjectSources({
          dir: 'packages/tooling',
          groups: [buildGroup({ packageName: 'plain-kit', kits: ['smoke'] })],
        }),
      ],
    });

    expect(result.split('\n')).toStrictEqual([
      '      packages/tooling/',
      '            plain-kit@2.1.0',
      '            To run: cd packages/tooling && rdy run --sources <kit>',
      '                  smoke',
    ]);
  });

  it('indents a checklist one level beneath its kit in plain style', () => {
    setStyle('plain');

    const result = formatRecursiveSourcesView({
      projects: [
        buildProjectSources({
          dir: '.',
          groups: [
            {
              kind: 'package',
              source: 'npm:plain-kit',
              name: 'plain-kit',
              version: '2.1.0',
              configured: true,
              kits: [buildKit('plain-kit', 'smoke', undefined, ['boot'])],
            },
          ],
        }),
      ],
    });

    expect(result.split('\n').slice(-2)).toStrictEqual(['                  smoke', '                        boot']);
  });
});

// region | Helpers

/** Builds a project on the default outDir, containing the named kits and no descriptions. */
function buildProject({ dir, kits }: { dir: string; kits: string[] }): RecursiveProjectView {
  return {
    dir,
    compiledKits: kits.map((name) => ({ name })),
    compiledStyle: { kind: 'local-convention' },
  };
}

/** Returns the line beneath a project's heading, which contains its command. */
function findProjectCommand(output: string, heading: string): string | undefined {
  const lines = output.split('\n');
  const headingIndex = lines.findIndex((line) => line.endsWith(` ${heading}`));
  return headingIndex === -1 ? undefined : lines[headingIndex + 1];
}

// endregion | Helpers
