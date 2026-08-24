import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureError, captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test, vi } from 'vitest';

const mockLoadConfig = vi.hoisted(() => vi.fn());

// Only the config is mocked; discovery, resolution, and kit expansion all read the temporary tree.
vi.mock(import('../../config/loadConfig.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/loadConfig.ts')>();
  return { DEFAULT_CONFIG: actual.DEFAULT_CONFIG, loadConfig: mockLoadConfig };
});

import { RdyError } from '../../errors/RdyError.ts';
import { ListOutputSchema } from '../../schemas/listOutputSchema.ts';
import { listCommand } from '../listCommand.ts';
import { findPackageCommand } from '../test-utils/findPackageCommand.ts';

const it = test.extend(
  'temp',
  makeFixture(() =>
    createTempTree(
      {
        // Declares two of the three installed publishers; `hidden-kit` is reachable by resolution alone.
        'package.json': JSON.stringify({
          name: 'consumer',
          dependencies: { '@acme/kits': '1.0.0' },
          devDependencies: { 'plain-kit': '0.4.0' },
        }),

        'node_modules/@acme/kits/package.json': JSON.stringify({ name: '@acme/kits', version: '2.1.0' }),
        'node_modules/@acme/kits/.readyup/kits/default.js': 'export default {};',
        'node_modules/@acme/kits/.readyup/kits/drift.js': 'export default {};',
        'node_modules/@acme/kits/.readyup/manifest.json': JSON.stringify({
          version: 1,
          kits: [{ name: 'default', description: 'Dependency drift' }, { name: 'drift' }],
        }),

        'node_modules/hidden-kit/package.json': JSON.stringify({ name: 'hidden-kit', version: '3.0.0' }),
        'node_modules/hidden-kit/.readyup/kits/audit.js': 'export default {};',

        'node_modules/plain-kit/package.json': JSON.stringify({ name: 'plain-kit', version: '0.4.0' }),
        'node_modules/plain-kit/.readyup/kits/smoke.js': 'export default {};',
      },
      { prefix: 'rdy-packages-' },
    ),
  ),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  configurePackages([]);
  await runTest();
});

describe('list --packages', () => {
  describe('rendering', () => {
    it('heads one block per kit-publishing dependency, alphabetically', async () => {
      const { exitCode, stdout } = await list(['--packages']);

      expect(exitCode).toBe(0);
      expect(headings(stdout)).toStrictEqual([
        '@acme/kits@2.1.0 \u{00B7} not listed in the readyup config',
        'plain-kit@0.4.0 \u{00B7} not listed in the readyup config',
      ]);
    });

    // Discovery reads the declared dependencies, so only the config half reaches this one.
    it('reports a configured package no dependency field declares', async () => {
      configurePackages(['hidden-kit']);

      const { stdout } = await list(['--packages']);

      expect(headings(stdout)).toContain('hidden-kit@3.0.0');
      expect(stdout).toContain('\u{1F4D3} audit');
    });

    it('shows the kits of a package the config omits, not only its name', async () => {
      const { stdout } = await list(['--packages']);

      expect(stdout).toContain('\u{1F4D3} default \u{00B7} Dependency drift');
      expect(stdout).toContain('\u{1F4D3} drift');
    });

    // The hint is what tells the reader whether a `--packages` run would reach the package.
    it('hints a configured package with the run reaching it and an unconfigured one with its source', async () => {
      configurePackages(['@acme/kits']);

      const { stdout } = await list(['--packages']);

      expect(findPackageCommand(stdout, '@acme/kits@2.1.0')).toBe('   To run: rdy run --packages [<name>]');
      expect(findPackageCommand(stdout, 'plain-kit@0.4.0')).toBe('   To run: rdy run --from npm:plain-kit <name>');
    });

    it('marks an unconfigured package and leaves a configured one unmarked', async () => {
      configurePackages(['@acme/kits']);

      const { stdout } = await list(['--packages']);

      expect(headings(stdout)).toStrictEqual([
        '@acme/kits@2.1.0',
        'plain-kit@0.4.0 \u{00B7} not listed in the readyup config',
      ]);
    });

    it('omits the project\u{2019}s own kits, which belong to the plain listing', async () => {
      const { stdout } = await list(['--packages']);

      expect(stdout).not.toContain('Internal');
      expect(stdout).not.toContain('Compiled');
      expect(stdout).not.toContain('Available');
    });

    it('warns and omits a configured package that cannot be resolved', async () => {
      configurePackages(['absent-package']);

      const { exitCode, stdout, stderr } = await list(['--packages']);

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Configured package "absent-package" was not found');
      expect(stdout).not.toContain('absent-package');
    });
  });

  describe('JSON payload', () => {
    it('emits a row per published kit, marked with whether the config names its package', async () => {
      configurePackages(['@acme/kits']);

      const payload = await runForPayload();

      expect(payload).toMatchObject({
        kits: [
          { name: 'default', kind: 'compiled', origin: { package: '@acme/kits', version: '2.1.0', configured: true } },
          { name: 'drift', kind: 'compiled', origin: { package: '@acme/kits', configured: true } },
          { name: 'smoke', kind: 'compiled', origin: { package: 'plain-kit', configured: false } },
        ],
      });
    });

    it('carries the description a publisher records, and omits the field where there is none', async () => {
      const payload = await runForPayload();

      expect(findKit(payload, 'default')).toMatchObject({ description: 'Dependency drift' });
      expect(findKit(payload, 'drift')).not.toHaveProperty('description');
    });

    // Every candidate the owner listing would name appears here as kit rows instead.
    it('emits no candidate list, since nothing is left to name separately', async () => {
      const payload = await runForPayload();

      expect(payload).not.toHaveProperty('availablePackages');
    });

    it('validates against the published list schema', async () => {
      const payload = await runForPayload();

      expect(() => ListOutputSchema.parse(payload)).not.toThrow();
    });
  });

  describe('empty', () => {
    it('reports that nothing publishes kits', async () => {
      using emptyTree = createTempTree(
        { 'package.json': JSON.stringify({ name: 'bare' }) },
        { prefix: 'rdy-packages-empty-' },
      );
      using _cwd = pointCwdAt(emptyTree.dir);

      const { exitCode, stdout } = await list(['--packages']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No installed dependency publishes kits.');
    });
  });

  describe('flag conflicts', () => {
    it('rejects --packages with --from', async () => {
      const error = await captureError(RdyError, () => listCommand(['--packages', '--from', '.']));

      expect(error.message).toBe('--packages and --from are mutually exclusive');
    });

    it('rejects --packages with --manifest', async () => {
      const error = await captureError(RdyError, () => listCommand(['--packages', '--manifest', 'x.json']));

      expect(error.message).toBe('--packages and --manifest are mutually exclusive');
    });
  });
});

// region | Helpers

/** Points the mocked config loader at the given package list, leaving every other setting at its default. */
function configurePackages(packages: string[]): void {
  mockLoadConfig.mockResolvedValue({
    compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined },
    internal: { dir: '.', infix: undefined },
    packages,
  });
}

/** Returns the payload row for the named kit, typed loosely because the payload is parsed JSON. */
function findKit(payload: unknown, name: string): unknown {
  const parsed = ListOutputSchema.parse(payload);
  return parsed.kits.find((kit) => kit.name === name);
}

/** Returns each package heading with its rule and glyph stripped, so the label alone is asserted. */
function headings(output: string): string[] {
  return output
    .split('\n')
    .filter((line) => line.startsWith('\u{2501}\u{2501} '))
    .map((line) => line.replace('\u{2501}\u{2501} \u{1F4E6}', '').trim());
}

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
async function list(args: string[]) {
  using io = captureStdio();

  const exitCode = await listCommand(args);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

/** Runs a packages listing under `--json` and returns the payload it emitted. */
async function runForPayload(): Promise<unknown> {
  const { stdout } = await list(['--packages', '--json']);
  return JSON.parse(stdout);
}

// endregion | Helpers
