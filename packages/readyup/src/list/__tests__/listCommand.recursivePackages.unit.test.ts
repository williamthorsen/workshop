import path from 'node:path';
import process from 'node:process';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test, vi } from 'vitest';

const mockLoadConfig = vi.hoisted(() => vi.fn());

// Only the config is mocked; discovery, resolution, and kit expansion all read the temporary tree.
vi.mock(import('../../config/loadConfig.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/loadConfig.ts')>();
  return { ...actual, loadConfig: mockLoadConfig };
});

import { DEFAULT_CONFIG } from '../../config/loadConfig.ts';
import { ListOutputSchema } from '../../schemas/listOutputSchema.ts';
import { listCommand } from '../listCommand.ts';

const it = test.extend(
  'temp',
  makeFixture(() =>
    createTempTree(
      {
        // The sweep root, declaring two publishers and configuring one of them.
        'package.json': JSON.stringify({
          name: 'root',
          dependencies: { '@acme/kits': '1.0.0', 'plain-kit': '0.4.0' },
        }),

        'node_modules/@acme/kits/package.json': JSON.stringify({ name: '@acme/kits', version: '2.1.0' }),
        'node_modules/@acme/kits/.readyup/kits/drift.js': 'export default {};',
        'node_modules/@acme/kits/.readyup/manifest.json': JSON.stringify({
          version: 1,
          kits: [{ name: 'drift', description: 'Dependency drift' }],
        }),

        'node_modules/plain-kit/package.json': JSON.stringify({ name: 'plain-kit', version: '0.4.0' }),
        'node_modules/plain-kit/.readyup/kits/smoke.js': 'export default {};',

        // A workspace with a publisher of its own and no readyup footprint at all. Its copy of `plain-kit`
        // is a different version from the root's, so a listing reading the root would name the wrong one.
        'packages/app/package.json': JSON.stringify({ name: 'app', dependencies: { 'plain-kit': '0.9.0' } }),
        'packages/app/node_modules/plain-kit/package.json': JSON.stringify({ name: 'plain-kit', version: '0.9.0' }),
        'packages/app/node_modules/plain-kit/.readyup/kits/smoke.js': 'export default {};',

        // A workspace depending on nothing that publishes kits.
        'packages/bare/package.json': JSON.stringify({ name: 'bare' }),
      },
      { prefix: 'rdy-recursive-packages-' },
    ),
  ),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  configureProjects({ '.': ['@acme/kits'] });
  await runTest();
});

describe('list --recursive --packages', () => {
  describe('rendering', () => {
    it('reports each project as a directory heading over its kit-publishing dependencies', async () => {
      const { exitCode, stdout } = await list();

      expect(exitCode).toBe(0);
      expect(stdout.trimEnd().split('\n')).toStrictEqual([
        '\u{1F4C1} ./',
        '   \u{1F4E6} @acme/kits@2.1.0',
        '      To run: rdy run --packages <name>',
        '      \u{1F4D3} drift \u{00B7} Dependency drift',
        '',
        '   \u{1F4E6} plain-kit@0.4.0 \u{00B7} not listed in the readyup config',
        '      To run: rdy run --from npm:plain-kit <name>',
        '      \u{1F4D3} smoke',
        '',
        '\u{1F4C1} packages/app/',
        '   \u{1F4E6} plain-kit@0.9.0 \u{00B7} not listed in the readyup config',
        '      To run: cd packages/app && rdy run --from npm:plain-kit <name>',
        '      \u{1F4D3} smoke',
      ]);
    });

    // The gate `--recursive` applies belongs to the authoring axis; this axis asks what a workspace depends on.
    it('reports a workspace with no readyup footprint of its own', async () => {
      const { stdout } = await list();

      expect(stdout).toContain('\u{1F4C1} packages/app/');
    });

    // Each workspace resolves its own copy, so the version reported is the one installed beside it.
    it('reads each workspace through its own node_modules', async () => {
      const { stdout } = await list();

      expect(stdout).toContain('plain-kit@0.9.0');
      expect(stdout).toContain('plain-kit@0.4.0');
    });

    it('omits a workspace depending on nothing that publishes kits', async () => {
      const { stdout } = await list();

      expect(stdout).not.toContain('packages/bare');
    });

    // Configured membership is a fact about one project's config, so the same package reports differently.
    it('marks a package against the config of the project reporting it', async () => {
      configureProjects({ '.': ['@acme/kits'], 'packages/app': ['plain-kit'] });

      const { stdout } = await list();

      expect(stdout).toContain('   \u{1F4E6} plain-kit@0.9.0\n      To run: cd packages/app && rdy run --packages');
      expect(stdout).toContain('plain-kit@0.4.0 \u{00B7} not listed in the readyup config');
    });

    it('reports the empty-sweep message when no project depends on a publisher', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.resolve('packages/bare'));
      // Keyed on the directory the sweep reports, which is `.` for whichever project the sweep starts in.
      configureProjects({});

      const { exitCode, stdout } = await list();

      expect(exitCode).toBe(0);
      expect(stdout.trimEnd()).toBe('No dependency of any project below this directory publishes kits.');
    });
  });

  describe('json payload', () => {
    it('identifies both the project and the publishing package on every row', async () => {
      const payload = await runForPayload();
      const parsed = ListOutputSchema.parse(payload);

      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.kits.map((kit) => [kit.project, kit.origin?.package, kit.origin?.configured])).toStrictEqual([
        ['.', '@acme/kits', true],
        ['.', 'plain-kit', false],
        ['packages/app', 'plain-kit', false],
      ]);
    });

    // Rows key on project as well as package, so neither collapses into the other.
    it('emits one row per project for a package two of them depend on', async () => {
      const parsed = ListOutputSchema.parse(await runForPayload());
      const smoke = parsed.kits.filter((kit) => kit.name === 'smoke');

      expect(smoke.map((kit) => kit.project)).toStrictEqual(['.', 'packages/app']);
    });

    // Every package's kits are rows of their own here, so there is nothing left to name as a candidate.
    it('emits no candidate list', async () => {
      const parsed = ListOutputSchema.parse(await runForPayload());

      expect(parsed.availablePackages).toBeUndefined();
    });
  });
});

// region | Helpers

/** Points the mocked config loader at a package list per project directory, defaulting the rest to none. */
function configureProjects(byDir: Record<string, string[]>): void {
  mockLoadConfig.mockImplementation((options: { fromDir?: string } = {}) => {
    const fromDir = options.fromDir ?? process.cwd();
    const dir = path.relative(process.cwd(), fromDir) || '.';

    return Promise.resolve({ ...DEFAULT_CONFIG, packages: byDir[dir] ?? [] });
  });
}

/** Runs the repo-wide dependency listing, returning its exit code alongside everything it wrote. */
async function list(args: string[] = []) {
  using io = captureStdio();

  const exitCode = await listCommand(['--recursive', '--packages', ...args]);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

/** Runs the listing under `--json` and returns the payload it emitted. */
async function runForPayload(): Promise<unknown> {
  const { stdout } = await list(['--json']);
  return JSON.parse(stdout);
}

// endregion | Helpers
