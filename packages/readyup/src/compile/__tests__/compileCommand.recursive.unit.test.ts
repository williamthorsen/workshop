import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureError, captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it as baseIt, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());
const mockValidateCompiledOutput = vi.hoisted(() => vi.fn());

// The bundler and the import of its output are mocked; discovery, configs, manifests, and the drift gate read the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

vi.mock(import('../validateCompiledOutput.ts'), () => ({
  validateCompiledOutput: mockValidateCompiledOutput,
}));

import { RdyError } from '../../errors/RdyError.ts';
import { setStyle } from '../../layout/engine.ts';
import { CompileOutputSchema } from '../../schemas/compileOutputSchema.ts';
import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';

/** The tree swept by every test: one repository whose projects all compile, and one holding each project-level failure. */
const FIXTURE_TREE = {
  // -- A repository whose every project compiles --

  // Sweep root, authoring one kit of its own.
  'clean/package.json': JSON.stringify({ name: 'root' }),
  'clean/.readyup/kits/demo.ts': 'export default {};',

  // Two kits, never compiled.
  'clean/packages/api/package.json': JSON.stringify({ name: 'api' }),
  'clean/packages/api/.readyup/kits/deploy.ts': 'export default {};',
  'clean/packages/api/.readyup/kits/smoke.ts': 'export default {};',

  // Kits since deleted, manifest left behind.
  'clean/packages/emptied/package.json': JSON.stringify({ name: 'emptied' }),
  'clean/packages/emptied/.readyup/manifest.json': JSON.stringify({ version: 1, kits: [{ name: 'gone' }] }),

  // Compiled with --skip-manifest: Kits on disk, no sources and no manifest beside them.
  'clean/packages/compiled-only/package.json': JSON.stringify({ name: 'compiled-only' }),
  'clean/packages/compiled-only/.readyup/kits/thing.js': 'export default {};',

  // A workspace with no readyup footprint at all.
  'clean/packages/plain/package.json': JSON.stringify({ name: 'plain' }),

  // Source and output directories repointed by the config.
  'clean/packages/tooling/package.json': JSON.stringify({ name: 'tooling' }),
  'clean/packages/tooling/.config/readyup.config.ts':
    "export default { compile: { srcDir: 'kit-sources', outDir: 'dist/kits' } };",
  'clean/packages/tooling/kit-sources/lint.ts': 'export default {};',

  // -- A repository holding a project-level failure of each kind --

  'faulty/package.json': JSON.stringify({ name: 'faulty' }),

  // A config that cannot be evaluated, over kits and a manifest that must be left alone.
  'faulty/packages/broken/package.json': JSON.stringify({ name: 'broken' }),
  'faulty/packages/broken/.config/readyup.config.ts': 'export default { this is not TypeScript',
  'faulty/packages/broken/.readyup/kits/probe.ts': 'export default {};',
  'faulty/packages/broken/.readyup/manifest.json': JSON.stringify({ version: 1, kits: [{ name: 'probe' }] }),

  // A compiled kit edited by hand since the manifest recorded its hash.
  'faulty/packages/drifted/package.json': JSON.stringify({ name: 'drifted' }),
  'faulty/packages/drifted/.readyup/kits/lint.ts': 'export default {};',
  'faulty/packages/drifted/.readyup/kits/lint.js': 'export default { edited: true };',
  'faulty/packages/drifted/.readyup/manifest.json': JSON.stringify({
    version: 1,
    kits: [{ name: 'lint', path: 'kits/lint.js', targetHash: '00000000' }],
  }),

  // Two sources that claim the kit name `deploy`, beside a kit that compiles.
  'faulty/packages/shared-name/package.json': JSON.stringify({ name: 'shared-name' }),
  'faulty/packages/shared-name/.readyup/kits/deploy.ts': 'export default {};',
  'faulty/packages/shared-name/.readyup/kits/ops/deploy.ts': 'export default {};',
  'faulty/packages/shared-name/.readyup/kits/rotate.ts': 'export default {};',

  // Sorts after the broken, drifted, and shared-name projects, so the sweep reaching it shows that they did not end the run.
  'faulty/packages/sound/package.json': JSON.stringify({ name: 'sound' }),
  'faulty/packages/sound/.readyup/kits/ok.ts': 'export default {};',

  // A directory where the manifest file belongs, so writing the manifest fails.
  'faulty/packages/unwritable/package.json': JSON.stringify({ name: 'unwritable' }),
  'faulty/packages/unwritable/.readyup/kits/audit.ts': 'export default {};',
  'faulty/packages/unwritable/.readyup/manifest.json/.keep': '',
};

describe('compile --recursive', () => {
  const it = baseIt.extend(
    'temp',
    makeFixture(() => createTempTree(FIXTURE_TREE, { prefix: 'rdy-compile-recursive-' })),
  );

  beforeEach(() => {
    mockCompileConfig.mockImplementation(compileResult);
    mockValidateCompiledOutput.mockResolvedValue({ checklists: [] });
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
    mockValidateCompiledOutput.mockReset();
    setStyle('rich');
  });

  describe('a repository whose every project compiles', () => {
    it.aroundEach(async (runTest, { temp }) => {
      using _cwd = pointCwdAt(temp.resolve('clean'));

      await runTest();
    });

    it('compiles the kits of every kit project, the sweep root first', async () => {
      const { exitCode } = await compile(['--recursive']);

      expect(exitCode).toBe(0);
      expect(compiledSources()).toStrictEqual([
        '.readyup/kits/demo.ts',
        'packages/api/.readyup/kits/deploy.ts',
        'packages/api/.readyup/kits/smoke.ts',
        'packages/tooling/kit-sources/lint.ts',
      ]);
    });

    it('heads each project with its paths named against the sweep root', async () => {
      const { stdout } = await compile(['--recursive']);

      expect(stdout).toContain('Compiling kits in .readyup/kits\n');
      expect(stdout).toContain('Compiling kits in packages/api/.readyup/kits\n');
      expect(stdout).toContain('Compiling kits from packages/tooling/kit-sources to packages/tooling/dist/kits\n');
    });

    it('writes each project its own manifest, with paths relative to that manifest', async ({ temp }) => {
      await compile(['--recursive']);

      expect(readManifestKits(temp.resolve('clean/packages/api/.readyup/manifest.json'))).toStrictEqual([
        expect.objectContaining({ name: 'deploy', path: 'kits/deploy.js', source: 'kits/deploy.ts' }),
        expect.objectContaining({ name: 'smoke', path: 'kits/smoke.js', source: 'kits/smoke.ts' }),
      ]);
      expect(readManifestKits(temp.resolve('clean/.readyup/manifest.json'))).toStrictEqual([
        expect.objectContaining({ name: 'demo' }),
      ]);
    });

    it('resolves a repointed project under its own config', async ({ temp }) => {
      await compile(['--recursive']);

      expect(mockCompileConfig).toHaveBeenCalledWith(
        expect.stringMatching(/packages\/tooling\/kit-sources\/lint\.ts$/),
        expect.stringMatching(/packages\/tooling\/dist\/kits\/lint\.js$/),
      );
      expect(existsSync(temp.resolve('clean/packages/tooling/.readyup/manifest.json'))).toBe(true);
    });

    it('seeds no manifest in a workspace with no readyup footprint', async ({ temp }) => {
      await compile(['--recursive']);

      expect(existsSync(temp.resolve('clean/packages/plain/.readyup'))).toBe(false);
    });

    it('empties the manifest of a project whose kits were all deleted', async ({ temp }) => {
      const { stdout } = await compile(['--recursive']);

      expect(readManifestKits(temp.resolve('clean/packages/emptied/.readyup/manifest.json'))).toStrictEqual([]);
      expect(stdout).toContain(
        'Source directory not found: packages/emptied/.readyup/kits; manifest now lists no kits',
      );
    });

    it('writes no manifest for a project holding compiled kits alone, and warns on each of its bundles', async ({
      temp,
    }) => {
      const { stdout, stderr } = await compile(['--recursive']);

      expect(existsSync(temp.resolve('clean/packages/compiled-only/.readyup/manifest.json'))).toBe(false);
      expect(existsSync(temp.resolve('clean/packages/compiled-only/.readyup/kits/thing.js'))).toBe(true);
      expect(stdout).toContain('No .ts files found in packages/compiled-only/.readyup/kits; manifest not written');
      expect(stderr).toContain(
        'Warning: thing.js in packages/compiled-only/.readyup/kits is not recorded in the manifest, and no source compiles to it.',
      );
    });

    it('prints no closing problems line when every project passed', async () => {
      const { stdout } = await compile(['--recursive']);

      expect(stdout).not.toContain('Problems in');
    });

    it('fails the run on a kit that fails in one project, and still compiles the projects after it', async () => {
      mockCompileConfig.mockImplementation((inputPath, outputPath) =>
        inputPath.endsWith('deploy.ts')
          ? Promise.reject(new Error('bundle failed'))
          : compileResult(inputPath, outputPath),
      );

      const { exitCode, stdout, stderr } = await compile(['--recursive']);

      expect(exitCode).toBe(1);
      expect(compiledSources()).toContain('packages/tooling/kit-sources/lint.ts');
      expect(stderr).toContain('Error compiling packages/api/.readyup/kits/deploy.ts: bundle failed');
      expect(stdout).toContain('\nProblems in 1 of 5 projects: packages/api\n');
    });

    describe('under --json', () => {
      it('names the project of every kit, and reports every visited project', async () => {
        const payload = CompileOutputSchema.parse(await compileForPayload());

        expect(payload).toStrictEqual({
          schemaVersion: 1,
          passed: true,
          kits: [
            { name: 'demo', project: '.', status: 'compiled' },
            { name: 'deploy', project: 'packages/api', status: 'compiled' },
            { name: 'smoke', project: 'packages/api', status: 'compiled' },
            { name: 'lint', project: 'packages/tooling', status: 'compiled' },
          ],
          projects: [
            { project: '.', passed: true },
            { project: 'packages/api', passed: true },
            { project: 'packages/compiled-only', passed: true },
            { project: 'packages/emptied', passed: true },
            { project: 'packages/tooling', passed: true },
          ],
          warnings: [
            {
              code: 'bundle-unrecorded',
              message:
                'thing.js in packages/compiled-only/.readyup/kits is not recorded in the manifest, and no source compiles to it.',
              remedy: 'Delete it if its kit was removed.',
            },
          ],
        });
      });

      it('keeps human output off stdout', async () => {
        const { stdout, stderr } = await compile(['--recursive', '--json']);

        expect(CompileOutputSchema.safeParse(JSON.parse(stdout)).success).toBe(true);
        expect(stderr).toContain('Compiling kits in packages/api/.readyup/kits');
      });

      it('collects the warnings raised by kits across projects, naming paths against the sweep root', async () => {
        mockCompileConfig.mockImplementation(async (inputPath, outputPath) => {
          const result = await compileResult(inputPath, outputPath);
          if (!inputPath.endsWith('demo.ts') && !inputPath.endsWith('deploy.ts')) return result;

          const source = realpathSync(inputPath);
          // Each kit sits at `.readyup/kits/<kit>.ts` below its project's `package.json`.
          return {
            ...result,
            inlinedJson: [{ importers: [source], path: path.resolve(source, '../../../package.json') }],
          };
        });

        const payload = CompileOutputSchema.parse(await compileForPayload());

        expect(payload.passed).toBe(true);
        expect(payload.warnings?.map((warning) => warning.message)).toStrictEqual([
          expect.stringContaining('kit "demo" bundles all of package.json, imported by .readyup/kits/demo.ts,'),
          expect.stringContaining(
            'kit "deploy" bundles all of packages/api/package.json, imported by packages/api/.readyup/kits/deploy.ts,',
          ),
          expect.stringContaining('thing.js in packages/compiled-only/.readyup/kits is not recorded in the manifest'),
        ]);
      });
    });
  });

  describe('a repository holding project-level failures', () => {
    it.aroundEach(async (runTest, { temp }) => {
      using _cwd = pointCwdAt(temp.resolve('faulty'));

      await runTest();
    });

    it('fails the run and reports every failing project in a closing line', async () => {
      const { exitCode, stdout } = await compile(['--recursive']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(
        '\nProblems in 4 of 5 projects: packages/broken, packages/drifted, packages/shared-name, packages/unwritable\n',
      );
    });

    it('reports a project whose config cannot be evaluated, compiling nothing in it and leaving its manifest', async ({
      temp,
    }) => {
      const manifestPath = temp.resolve('faulty/packages/broken/.readyup/manifest.json');
      const manifestBefore = readFileSync(manifestPath, 'utf8');

      const { stderr } = await compile(['--recursive']);

      expect(stderr).toMatch(/^Error in packages\/broken: .+$/m);
      expect(compiledSources().some((source) => source.startsWith('packages/broken/'))).toBe(false);
      expect(readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
    });

    it('skips a drifted kit and counts it against the run', async () => {
      const { stdout } = await compile(['--recursive']);

      expect(stdout).toContain('drift in lint.js: expected 00000000');
      expect(compiledSources()).not.toContain('packages/drifted/.readyup/kits/lint.ts');
    });

    it('fails the sources that share a kit name, naming them against the sweep root, and compiles the rest', async () => {
      const { stderr } = await compile(['--recursive']);

      const sharedNameError =
        'Kit name "deploy" is shared by packages/shared-name/.readyup/kits/deploy.ts and ' +
        'packages/shared-name/.readyup/kits/ops/deploy.ts.';
      expect(stderr).toContain(`Error compiling packages/shared-name/.readyup/kits/deploy.ts: ${sharedNameError}`);
      expect(stderr).toContain(`Error compiling packages/shared-name/.readyup/kits/ops/deploy.ts: ${sharedNameError}`);
      expect(compiledSources().filter((source) => source.startsWith('packages/shared-name/'))).toStrictEqual([
        'packages/shared-name/.readyup/kits/rotate.ts',
      ]);
    });

    it('reports a project whose manifest cannot be written, and still compiles the projects before it', async () => {
      const { stderr } = await compile(['--recursive']);

      expect(stderr).toMatch(/^Error in packages\/unwritable: Error writing manifest: .+$/m);
      expect(compiledSources()).toContain('packages/sound/.readyup/kits/ok.ts');
    });

    it('reports each failure against its project under --json', async () => {
      const payload = CompileOutputSchema.parse(await compileForPayload());

      expect(payload.passed).toBe(false);
      expect(payload.kits).toContainEqual(
        expect.objectContaining({ name: 'lint', project: 'packages/drifted', status: 'skipped' }),
      );
      expect(payload.kits.filter((kit) => kit.project === 'packages/shared-name')).toStrictEqual([
        { name: 'deploy', project: 'packages/shared-name', status: 'failed', error: expect.stringContaining('deploy') },
        { name: 'deploy', project: 'packages/shared-name', status: 'failed', error: expect.stringContaining('deploy') },
        { name: 'rotate', project: 'packages/shared-name', status: 'compiled' },
      ]);
      expect(payload.projects).toStrictEqual([
        { project: 'packages/broken', passed: false, error: expect.any(String) },
        { project: 'packages/drifted', passed: false },
        { project: 'packages/shared-name', passed: false },
        { project: 'packages/sound', passed: true },
        { project: 'packages/unwritable', passed: false, error: expect.stringContaining('Error writing manifest') },
      ]);
    });
  });

  describe('a tree holding no kit project', () => {
    it('says so and passes', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.resolve('clean/packages/plain'));

      const { exitCode, stdout } = await compile(['--recursive']);

      expect(exitCode).toBe(0);
      expect(stdout).toBe('No kit projects found.\n');
    });

    it('emits an empty payload under --json', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.resolve('clean/packages/plain'));

      await expect(compileForPayload()).resolves.toStrictEqual({
        schemaVersion: 1,
        passed: true,
        kits: [],
        projects: [],
      });
    });
  });

  describe('flag exclusivity', () => {
    it.for([
      { args: ['--recursive', 'kit.ts'], message: '--recursive and an input file are mutually exclusive' },
      { args: ['--recursive', '--output', 'out.js'], message: '--recursive and --output are mutually exclusive' },
      {
        args: ['--recursive', '--manifest', '.readyup/manifest.json'],
        message: '--recursive and --manifest are mutually exclusive',
      },
      {
        args: ['--recursive', '--config', 'custom/readyup.config.ts'],
        message: '--recursive and --config are mutually exclusive',
      },
    ])('rejects $args', async ({ args, message }) => {
      const error = await captureError(RdyError, () => compileCommand(args));

      expect(error.code).toBe('usage');
      expect(error.message).toBe(message);
    });
  });
});

// region | Helpers

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
async function compile(args: string[]) {
  using io = captureStdio();

  const exitCode = await compileCommand(args);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

/** Runs a recursive compile under `--json` and returns the payload that it emitted. */
async function compileForPayload(): Promise<unknown> {
  const { stdout } = await compile(['--recursive', '--json']);
  return JSON.parse(stdout);
}

/** Returns a successful compile result for a source, recording the source as its only input. */
function compileResult(inputPath: string, outputPath = inputPath.replace(/\.ts$/, '.js')): Promise<CompileResult> {
  return Promise.resolve({
    bundledDependencies: {},
    changed: true,
    esbuildVersion: '0.99.0-test',
    inlinedJson: [],
    inputs: [{ hash: '5c0e1234', kind: 'module', path: realpathSync(inputPath) }],
    outputPath: path.resolve(outputPath),
    targetHash: 'aaaa1111',
  });
}

/** Returns the sources handed to the bundler, relative to the working directory, in the order compiled. */
function compiledSources(): string[] {
  return mockCompileConfig.mock.calls.map(([inputPath]) => path.relative(process.cwd(), inputPath));
}

/** Reads the kit entries recorded by the manifest at `manifestPath`. */
function readManifestKits(manifestPath: string): unknown {
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return typeof manifest === 'object' && manifest !== null && 'kits' in manifest ? manifest.kits : undefined;
}

// endregion | Helpers
