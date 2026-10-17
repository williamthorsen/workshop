import { describe, expect, it } from 'vitest';

import { richFormatter } from '../../layout/formatter.ts';
import { formatManifestView, formatSourcesView } from '../formatList.ts';
import { findPackageCommand } from '../test-utils/findPackageCommand.ts';
import { buildGroup, buildKit } from '../test-utils/source-group-fixtures.ts';

const COMPILED = richFormatter.tokens.kit.text;
const PACKAGE = richFormatter.tokens.sourcePackage.text;
const CHECKLIST = richFormatter.tokens.checklist.text;

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

  it('places the kits directly beneath the heading, with no blank line anywhere', () => {
    const lines = formatManifestView({
      kits: [{ name: 'deploy' }],
      manifestPath: '.readyup/manifest.json',
    }).split('\n');

    expect(lines[0]).toBe('\u{2500}\u{2500} Manifest: .readyup/manifest.json');
    expect(lines[1]).toBe(`${COMPILED} deploy`);
  });

  it('names the command that runs the kits when given the source that named the manifest', () => {
    const lines = formatManifestView({
      kits: [{ name: 'deploy' }],
      manifestPath: 'https://example.test/.readyup/manifest.json',
      fromArg: 'github:acme/ops',
    }).split('\n');

    expect(lines[1]).toBe('   To run: rdy run --from github:acme/ops <kit>[:<checklist>,...]');
    expect(lines[2]).toBe(`${COMPILED} deploy`);
  });

  it('brackets the kit and its checklist filter together when the manifest records a default kit', () => {
    const lines = formatManifestView({
      kits: [{ name: 'default' }],
      manifestPath: 'https://example.test/.readyup/manifest.json',
      fromArg: 'github:acme/ops',
    }).split('\n');

    expect(lines[1]).toBe('   To run: rdy run --from github:acme/ops [<kit>[:<checklist>,...]]');
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

  it('nests the checklists beneath the kit line, after its version and description', () => {
    const lines = formatManifestView({
      kits: [{ name: 'default', description: 'Health', readyupVersion: '0.20.0', checklists: ['setup', 'freshness'] }],
      manifestPath: '.readyup/manifest.json',
    }).split('\n');

    expect(lines.slice(1)).toStrictEqual([
      `${COMPILED} default (readyup v0.20.0) \u{00B7} Health`,
      `   ${CHECKLIST} setup`,
      `   ${CHECKLIST} freshness`,
    ]);
  });

  it('renders no checklist rows for a kit that records an empty list', () => {
    const lines = formatManifestView({
      kits: [{ name: 'deploy', checklists: [] }],
      manifestPath: '.readyup/manifest.json',
    }).split('\n');

    expect(lines).toStrictEqual(['\u{2500}\u{2500} Manifest: .readyup/manifest.json', `${COMPILED} deploy`]);
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

describe(formatSourcesView, () => {
  it('heads each package with its name and version', () => {
    const result = formatSourcesView({
      groups: [buildGroup({ packageName: '@acme/kits', version: '2.1.0', kits: ['drift'] })],
    });

    expect(result).toContain(`\u{2501}\u{2501} ${PACKAGE} @acme/kits@2.1.0`);
  });

  // Built inline rather than through the helper, whose default would fill the version back in.
  it('heads a package that declares no version with its name alone', () => {
    const result = formatSourcesView({
      groups: [
        {
          kind: 'package',
          source: 'npm:plain-kit',
          name: 'plain-kit',
          version: undefined,
          configured: true,
          kits: [buildKit('plain-kit', 'smoke', undefined)],
        },
      ],
    });

    expect(result).toContain(`\u{2501}\u{2501} ${PACKAGE} plain-kit\n`);
  });

  it('hints a configured package with the run that includes it', () => {
    const result = formatSourcesView({ groups: [buildGroup({ packageName: '@acme/kits', kits: ['drift'] })] });

    expect(findPackageCommand(result, '@acme/kits@2.1.0')).toBe('   To run: rdy run --sources <kit>');
  });

  // The hint tells the reader that a `--sources` run would skip this package.
  it('hints an unconfigured package with the source that names it directly', () => {
    const result = formatSourcesView({
      groups: [buildGroup({ packageName: '@acme/kits', configured: false, kits: ['drift'] })],
    });

    expect(findPackageCommand(result, '@acme/kits@2.1.0')).toBe(
      '   To run: rdy run --from npm:@acme/kits <kit>[:<checklist>,...]',
    );
  });

  it('brackets the positional name when the package publishes a default kit', () => {
    const result = formatSourcesView({
      groups: [buildGroup({ packageName: '@acme/kits', kits: ['default', 'drift'] })],
    });

    expect(findPackageCommand(result, '@acme/kits@2.1.0')).toBe('   To run: rdy run --sources [<kit>]');
  });

  it('marks an unconfigured package and leaves a configured one unmarked', () => {
    const result = formatSourcesView({
      groups: [
        buildGroup({ packageName: '@acme/kits', configured: false, kits: ['drift'] }),
        buildGroup({ packageName: 'plain-kit', kits: ['smoke'] }),
      ],
    });

    expect(result).toContain(`\u{2501}\u{2501} ${PACKAGE} @acme/kits@2.1.0 \u{00B7} not listed in the readyup config`);
    expect(result).toContain(`\u{2501}\u{2501} ${PACKAGE} plain-kit@2.1.0\n`);
  });

  it('renders a description as inline detail, and a kit without one as the bare name', () => {
    const result = formatSourcesView({
      groups: [
        {
          kind: 'package',
          source: 'npm:@acme/kits',
          name: '@acme/kits',
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

  it('nests a kit\u{2019}s checklists beneath it', () => {
    const result = formatSourcesView({
      groups: [
        {
          kind: 'package',
          source: 'npm:@acme/kits',
          name: '@acme/kits',
          version: '2.1.0',
          configured: true,
          kits: [buildKit('@acme/kits', 'drift', 'Dependency drift', ['lockfile', 'ranges'])],
        },
      ],
    });

    expect(result).toContain(
      `${COMPILED} drift \u{00B7} Dependency drift\n   ${CHECKLIST} lockfile\n   ${CHECKLIST} ranges`,
    );
  });

  it('separates one package block from the next with a blank line', () => {
    const result = formatSourcesView({
      groups: [
        buildGroup({ packageName: '@acme/kits', kits: ['drift'] }),
        buildGroup({ packageName: 'plain-kit', kits: ['smoke'] }),
      ],
    });

    expect(result).toContain(`${COMPILED} drift\n\n\u{2501}\u{2501} ${PACKAGE} plain-kit@2.1.0`);
  });

  it('reports the empty-sources message when nothing publishes kits', () => {
    expect(formatSourcesView({ groups: [] })).toBe('No installed dependency or configured source publishes kits.');
  });
});
