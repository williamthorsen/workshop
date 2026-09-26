import { captureError, captureStdio, createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, it as baseIt } from 'vitest';

import { RdyError } from '../../errors/RdyError.ts';
import { setStyle } from '../../layout/engine.ts';
import { VerifyOutputSchema } from '../../schemas/verifyOutputSchema.ts';
import { hashBytes } from '../targetHash.ts';
import { verifyCommand } from '../verifyCommand.ts';

const BUNDLE = 'export default {};';

/** A manifest recording one kit whose bundle is `BUNDLE`, unedited. */
const CLEAN_MANIFEST = JSON.stringify({
  version: 1,
  kits: [{ name: 'demo', path: 'kits/demo.js', targetHash: hashBytes(Buffer.from(BUNDLE)) }],
});

/** The tree swept by every test: one repository whose projects all pass, and one containing each project-level failure. */
const FIXTURE_TREE = {
  // -- A repository whose every project passes --

  'clean/package.json': JSON.stringify({ name: 'root' }),
  'clean/.readyup/kits/demo.js': BUNDLE,
  'clean/.readyup/manifest.json': CLEAN_MANIFEST,

  'clean/packages/api/package.json': JSON.stringify({ name: 'api' }),
  'clean/packages/api/.readyup/kits/demo.js': BUNDLE,
  'clean/packages/api/.readyup/manifest.json': CLEAN_MANIFEST,

  // A workspace with no readyup footprint, which the sweep does not visit.
  'clean/packages/plain/package.json': JSON.stringify({ name: 'plain' }),

  // -- A repository containing a project-level failure of each kind --

  'faulty/package.json': JSON.stringify({ name: 'faulty' }),
  'faulty/.readyup/kits/demo.js': BUNDLE,
  'faulty/.readyup/manifest.json': CLEAN_MANIFEST,

  // A config that cannot be evaluated, over a manifest that would pass.
  'faulty/packages/broken/package.json': JSON.stringify({ name: 'broken' }),
  'faulty/packages/broken/.config/readyup.config.ts': 'export default { this is not TypeScript',
  'faulty/packages/broken/.readyup/kits/demo.js': BUNDLE,
  'faulty/packages/broken/.readyup/manifest.json': CLEAN_MANIFEST,

  // A compiled kit edited by hand since the manifest recorded its hash.
  'faulty/packages/drifted/package.json': JSON.stringify({ name: 'drifted' }),
  'faulty/packages/drifted/.readyup/kits/demo.js': 'export default { edited: true };',
  'faulty/packages/drifted/.readyup/manifest.json': CLEAN_MANIFEST,

  // A manifest that is not JSON.
  'faulty/packages/invalid/package.json': JSON.stringify({ name: 'invalid' }),
  'faulty/packages/invalid/.readyup/kits/demo.js': BUNDLE,
  'faulty/packages/invalid/.readyup/manifest.json': '{ not json',

  // Sorts after the broken, drifted, and invalid projects, so the sweep reaching it shows that they did not end the run.
  'faulty/packages/sound/package.json': JSON.stringify({ name: 'sound' }),
  'faulty/packages/sound/.readyup/kits/demo.js': BUNDLE,
  'faulty/packages/sound/.readyup/manifest.json': CLEAN_MANIFEST,

  // Kit sources that were never compiled, so no manifest exists.
  'faulty/packages/uncompiled/package.json': JSON.stringify({ name: 'uncompiled' }),
  'faulty/packages/uncompiled/.readyup/kits/audit.ts': 'export default {};',

  // -- A repository containing no kit project --

  'empty/package.json': JSON.stringify({ name: 'empty' }),
};

describe('verify --recursive', () => {
  const it = baseIt.extend(
    'temp',
    makeFixture(() => createTempTree(FIXTURE_TREE, { prefix: 'rdy-verify-recursive-' })),
  );

  afterEach(() => {
    setStyle('rich');
  });

  describe('a repository whose every project passes', () => {
    it.aroundEach(async (runTest, { temp }) => {
      using _cwd = pointCwdAt(temp.resolve('clean'));

      await runTest();
    });

    it('verifies every kit project against its own manifest, the sweep root first', async () => {
      const { exitCode, stdout, stderr } = await verify(['--recursive']);

      expect(exitCode).toBe(0);
      const rootHeading = stdout.indexOf('Verifying kits against .readyup/manifest.json');
      const apiHeading = stdout.indexOf('Verifying kits against packages/api/.readyup/manifest.json');
      expect(rootHeading).toBeGreaterThanOrEqual(0);
      expect(apiHeading).toBeGreaterThan(rootHeading);
      expect(stdout).not.toContain('packages/plain');
      expect(stdout).not.toContain('Problems in');
      expect(stderr).toBe('');
    });

    it('names the project of every kit and lists every project under --json', async () => {
      const { exitCode, stdout } = await verify(['--recursive', '--json']);

      expect(exitCode).toBe(0);
      const payload = VerifyOutputSchema.parse(JSON.parse(stdout));
      expect(payload).toMatchObject({
        passed: true,
        kits: [
          { name: 'demo', project: '.', status: 'ok' },
          { name: 'demo', project: 'packages/api', status: 'ok' },
        ],
        projects: [
          { project: '.', passed: true },
          { project: 'packages/api', passed: true },
        ],
      });
    });
  });

  describe('a repository containing project-level failures', () => {
    it.aroundEach(async (runTest, { temp }) => {
      using _cwd = pointCwdAt(temp.resolve('faulty'));

      await runTest();
    });

    it('fails the run and lists every failing project in a closing line', async () => {
      const { exitCode, stdout } = await verify(['--recursive']);

      expect(exitCode).toBe(1);
      expect(stdout).toMatch(
        /Problems in 4 of 6 projects: packages\/broken, packages\/drifted, packages\/invalid, packages\/uncompiled\n$/,
      );
    });

    it('reports each project that cannot be verified against its directory', async () => {
      const { stderr } = await verify(['--recursive']);

      expect(stderr).toContain('Error in packages/broken: ');
      expect(stderr).toContain('Error in packages/invalid: ');
      expect(stderr).toContain(
        'Error in packages/uncompiled: No manifest at packages/uncompiled/.readyup/manifest.json. Run `rdy compile` in packages/uncompiled to create it.\n',
      );
    });

    it('does not verify a project whose config cannot be evaluated', async () => {
      const { stdout } = await verify(['--recursive']);

      expect(stdout).not.toContain('packages/broken/.readyup/manifest.json');
    });

    it('reports a drifted kit within its project and still verifies the projects after it', async () => {
      const { stdout } = await verify(['--recursive']);

      expect(stdout).toContain('Verifying kits against .readyup/manifest.json');
      expect(stdout).toMatch(
        /Verifying kits against packages\/drifted\/\.readyup\/manifest\.json[\s\S]*1 of 1 kits failed verification/,
      );
      expect(stdout).toContain('Verifying kits against packages/sound/.readyup/manifest.json');
    });

    it('reports each failure against its project under --json', async () => {
      const { exitCode, stdout } = await verify(['--recursive', '--json']);

      expect(exitCode).toBe(1);
      const payload = VerifyOutputSchema.parse(JSON.parse(stdout));
      expect(payload.passed).toBe(false);
      expect(payload.kits.map((kit) => [kit.project, kit.status])).toStrictEqual([
        ['.', 'ok'],
        ['packages/drifted', 'drift'],
        ['packages/sound', 'ok'],
      ]);
      expect(payload.projects).toStrictEqual([
        { project: '.', passed: true },
        { project: 'packages/broken', passed: false, error: expect.any(String) },
        { project: 'packages/drifted', passed: false },
        { project: 'packages/invalid', passed: false, error: expect.any(String) },
        { project: 'packages/sound', passed: true },
        {
          project: 'packages/uncompiled',
          passed: false,
          error:
            'No manifest at packages/uncompiled/.readyup/manifest.json. Run `rdy compile` in packages/uncompiled to create it.',
        },
      ]);
    });
  });

  describe('a tree containing no kit project', () => {
    it('says so and passes', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.resolve('empty'));

      const { exitCode, stdout } = await verify(['--recursive']);

      expect(exitCode).toBe(0);
      expect(stdout).toBe('No kit projects found.\n');
    });

    it('emits an empty payload under --json', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.resolve('empty'));

      const { exitCode, stdout } = await verify(['--recursive', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toStrictEqual({ schemaVersion: 1, passed: true, kits: [], projects: [] });
    });
  });

  it('rejects --recursive combined with --manifest', async () => {
    const error = await captureError(RdyError, () =>
      verifyCommand(['--recursive', '--manifest', '.readyup/manifest.json']),
    );

    expect(error.code).toBe('usage');
    expect(error.message).toBe('--recursive and --manifest are mutually exclusive');
  });
});

// region | Helpers

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
async function verify(args: string[]) {
  using io = captureStdio();

  const exitCode = await verifyCommand(args);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

// endregion | Helpers
