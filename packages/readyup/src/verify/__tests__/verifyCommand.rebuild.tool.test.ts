import { createRequire } from 'node:module';
import path from 'node:path';

import { captureStdio, createTempTree, pointCwdAt, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { version as installedEsbuildVersion } from 'esbuild';
import { afterEach, describe, expect, it as baseIt, vi } from 'vitest';

import { compileConfig, type CompileResult } from '../../compile/compileConfig.ts';
import { ManifestSchema, type RdyManifestKit } from '../../manifest/manifestSchema.ts';
import { type JsonVerifyOutput, VerifyOutputSchema } from '../../schemas/verifyOutputSchema.ts';
import { readInstalledPackageVersion } from '../../test-utils/readInstalledPackageVersion.ts';
import { VERSION } from '../../version.ts';
import { hashFile } from '../targetHash.ts';
import { verifyCommand } from '../verifyCommand.ts';

/** Absolute specifier for the `pickJson` marker, so that a kit written into a tempdir can import it. */
const PICK_JSON_MODULE = path.resolve(import.meta.dirname, '../../compile/pickJson.ts');

/** Absolute specifier for an installed package, so that the fixture's compile records a bundled dependency. */
const PICOMATCH_MODULE = createRequire(import.meta.url).resolve('picomatch');

const KIT_SOURCE = `import picomatch from ${JSON.stringify(PICOMATCH_MODULE)};
import { pickJson } from ${JSON.stringify(PICK_JSON_MODULE)};

export const metadata = pickJson('./data.json', ['name', 'version']);
export const matchesEverything = picomatch('*');

export default { checklists: [] };
`;

/** A readyup old enough that no fixture here could have been compiled by it. */
const PRIOR_VERSION = '0.19.2';

const it = baseIt
  .extend(
    'temp',
    makeFixture(() =>
      createTempTree(
        {
          'data.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
          'kit.ts': KIT_SOURCE,
          // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
          // temporary directory happens to contain a manifest.
          'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
        },
        { prefix: 'verify-rebuild-' },
      ),
    ),
    // Every test verifies the recorded manifest, so the compile runs whether or not a test names it.
  )
  .extend('compiled', { auto: true }, async ({ temp }): Promise<CompileResult> => recordCompiledManifest(temp));

it.aroundEach(async (runTest, { temp }) => {
  // `runVerify` names the manifest by a relative path, as a real project's invocation does.
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runTest();
});

/**
 * Exercises `--rebuild` against real esbuild, which is what the check is for: The inputs that it
 * catches and the recorded hashes miss are the ones that a mocked bundler stands in for.
 */
describe('verifyCommand --rebuild', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes an untouched tree', async () => {
    const { exitCode, stdout } = await runVerify();

    expect(exitCode).toBe(0);
    expect(readPayload(stdout)).toMatchObject({
      passed: true,
      kits: [{ name: 'demo', status: 'ok', sourceStatus: 'ok', rebuildStatus: 'ok' }],
    });
  });

  it('passes an untouched tree from a directory other than the one in which the kit was compiled', async ({ temp }) => {
    using _elsewhere = pointCwdAt(import.meta.dirname, { chdir: true });

    const { exitCode, stdout } = await runVerify({ manifestPath: temp.resolve('manifest.json') });

    expect(exitCode).toBe(0);
    expect(readPayload(stdout)).toMatchObject({
      passed: true,
      kits: [{ name: 'demo', status: 'ok', sourceStatus: 'ok', rebuildStatus: 'ok' }],
    });
  });

  it('fails a bundle stale only in an inlined JSON file, which both recorded hashes still pass', async ({ temp }) => {
    temp.write('data.json', JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const { exitCode, stdout } = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdout)).toMatchObject({
      passed: false,
      // The `.ts` and the `.js` are both untouched, so both hash verdicts pass. Only the rebuild
      // reads the JSON inlined by the bundle, which is the gap that the flag exists to close.
      kits: [{ status: 'ok', sourceStatus: 'ok', rebuildStatus: 'mismatch' }],
    });
  });

  it('inlines the edited value into the recompiled bundle rather than the committed one', async ({ temp }) => {
    temp.write('data.json', JSON.stringify({ name: 'demo', version: '2.0.0' }));

    await runVerify();

    expect(temp.read('kit.js')).toContain('1.0.0');
  });

  it('fails a bundle stale only in its version stamp, which both recorded hashes still pass', async ({ temp }) => {
    // A version bump moves neither the source nor the bundle, so the stamp and the hashes recorded for
    // it go stale in agreement and keep matching. Only a recompile reads the version.
    restampBundle(temp, PRIOR_VERSION);

    const { exitCode, stdout } = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdout)).toMatchObject({
      passed: false,
      kits: [{ status: 'ok', sourceStatus: 'ok', rebuildStatus: 'mismatch', rebuildCompiledWith: PRIOR_VERSION }],
    });
  });

  it('reports matching recorded versions on a mismatch that the record cannot explain', async ({ temp }) => {
    temp.write('data.json', JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const { stdout } = await runVerify();

    expect(readPayload(stdout).kits[0]).toMatchObject({
      rebuildStatus: 'mismatch',
      rebuildEsbuild: { recorded: installedEsbuildVersion, rebuilt: installedEsbuildVersion },
    });
  });

  it('names a recorded esbuild that differs from the one rebuilding', async ({ temp }) => {
    patchKits(temp, { esbuildVersion: '0.0.1-old' });
    temp.write('data.json', JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const { stdout } = await runVerify();

    expect(readPayload(stdout).kits[0]).toMatchObject({
      rebuildEsbuild: { recorded: '0.0.1-old', rebuilt: installedEsbuildVersion },
    });
  });

  it('names a dependency whose recorded version the rebuild does not reproduce', async ({ compiled, temp }) => {
    patchKits(temp, {
      bundledDependencies: { ...compiled.bundledDependencies, picomatch: '0.0.1-old' },
    });
    temp.write('data.json', JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const { stdout } = await runVerify();

    expect(readPayload(stdout).kits[0]).toMatchObject({
      rebuildStatus: 'mismatch',
      rebuildDependencyChanges: [
        { name: 'picomatch', recorded: '0.0.1-old', rebuilt: readInstalledPackageVersion('picomatch') },
      ],
    });
  });

  it('fails a hand-edited bundle', async ({ temp }) => {
    temp.write('kit.js', 'export default { checklists: [] };\n');

    const { exitCode, stderr, stdout } = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdout)).toMatchObject({
      kits: [{ status: 'drift', rebuildStatus: 'mismatch' }],
    });
    expect(stderr).toContain('Move the edits into the source, then run `rdy compile --force`.');
  });

  it('reports a passing rebuild beside a recorded hash that has gone wrong', async ({ temp }) => {
    patchKits(temp, { targetHash: 'deadbeef' });

    const { exitCode, stderr, stdout } = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdout)).toMatchObject({
      kits: [{ status: 'drift', rebuildStatus: 'ok' }],
    });
    expect(stderr).toContain(
      'The bundle reproduces, so its recorded hash is what is stale. Run `rdy compile --force` to re-record it.',
    );
    expect(stderr).not.toContain('Move the edits into the source');
  });

  it('fails a kit whose source no longer compiles', async ({ temp }) => {
    temp.write('kit.ts', 'export default { checklists: [ ;\n');

    const { exitCode, stderr, stdout } = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdout)).toMatchObject({
      kits: [{ rebuildStatus: 'failed' }],
    });
    expect(stderr).toContain('Fix the kit source so that it compiles.');
  });

  it('leaves every rebuild field out of the payload without the flag', async ({ temp }) => {
    temp.write('data.json', JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const { exitCode, stdout } = await runVerify({ rebuild: false });

    expect(exitCode).toBe(0);
    expect(readPayload(stdout).kits[0]).not.toHaveProperty('rebuildStatus');
  });
});

// region | Helpers

/** Applies a patch to every kit recorded in the tree's manifest. */
function patchKits(tree: TempTree, patch: Partial<RdyManifestKit>): void {
  const manifest = ManifestSchema.parse(tree.readJson('manifest.json'));
  const kits = manifest.kits.map((kit) => ({ ...kit, ...patch }));
  tree.write('manifest.json', JSON.stringify({ ...manifest, kits }));
}

/**
 * Reads the single JSON document that the run wrote to stdout.
 *
 * Parsed through the published schema rather than cast, so a payload that does not satisfy the
 * contract fails here rather than reaching an assertion that happens not to look at the bad field.
 */
function readPayload(stdout: string): JsonVerifyOutput {
  const emitted: unknown = JSON.parse(stdout);
  return VerifyOutputSchema.parse(emitted);
}

/**
 * Compiles the tree's kit and records the result in a manifest beside it, returning the compile result.
 *
 * Because the manifest contains hashes produced by the pipeline rather than hand-computed ones, a verdict
 * here is the one that a real project's compile would have earned.
 */
async function recordCompiledManifest(tree: TempTree): Promise<CompileResult> {
  const result = await compileConfig(tree.resolve('kit.ts'), tree.resolve('kit.js'));

  tree.write(
    'manifest.json',
    JSON.stringify({
      version: 1,
      kits: [
        {
          esbuildVersion: result.esbuildVersion,
          name: 'demo',
          path: 'kit.js',
          readyupVersion: VERSION,
          source: 'kit.ts',
          sourceHash: hashFile(tree.resolve('kit.ts')),
          targetHash: result.targetHash,
          ...(Object.keys(result.bundledDependencies).length > 0 && {
            bundledDependencies: result.bundledDependencies,
          }),
        },
      ],
    }),
  );

  return result;
}

/**
 * Rewrites the bundle's version stamp and re-records the manifest against the restamped bundle.
 *
 * The stamp, the recorded `targetHash`, and the recorded `readyupVersion` all name the earlier
 * readyup, which is the state left behind by a version bump.
 */
function restampBundle(tree: TempTree, version: string): void {
  const restamped = tree
    .read('kit.js')
    .replace(/__readyupVersion = "[^"]*"/, () => `__readyupVersion = ${JSON.stringify(version)}`);
  const bundlePath = tree.write('kit.js', restamped);

  patchKits(tree, { readyupVersion: version, targetHash: hashFile(bundlePath) });
}

/**
 * Runs `verify` over the tempdir's manifest with JSON output on and the rebuild check on unless waived,
 * returning its exit code alongside what it wrote.
 *
 * `--json` sends the payload to stdout and every human-readable line to stderr, so a test reading the
 * remedies reads stderr.
 */
async function runVerify({ rebuild = true, manifestPath = 'manifest.json' } = {}) {
  using io = captureStdio();

  const rebuildFlag = rebuild ? ['--rebuild'] : [];
  const exitCode = await verifyCommand(['--manifest', manifestPath, ...rebuildFlag, '--json']);

  return { exitCode, stderr: io.stderr, stdout: io.stdout };
}

// endregion | Helpers
