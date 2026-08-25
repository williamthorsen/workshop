import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { version as installedEsbuildVersion } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompileResult } from '../../compile/compileConfig.ts';
import { compileConfig } from '../../compile/compileConfig.ts';
import type { RdyManifestKit } from '../../manifest/manifestSchema.ts';
import { ManifestSchema } from '../../manifest/manifestSchema.ts';
import type { JsonVerifyOutput } from '../../schemas/verifyOutputSchema.ts';
import { VerifyOutputSchema } from '../../schemas/verifyOutputSchema.ts';
import { readInstalledPackageVersion } from '../../test-utils/readInstalledPackageVersion.ts';
import { VERSION } from '../../version.ts';
import { hashFile } from '../targetHash.ts';
import { verifyCommand } from '../verifyCommand.ts';

/** Absolute specifier for the `pickJson` marker, so a kit written into a tempdir can import it. */
const PICK_JSON_MODULE = path.resolve(import.meta.dirname, '../../compile/pickJson.ts');

/** Absolute specifier for an installed package, so the fixture's compile records a bundled dependency. */
const PICOMATCH_MODULE = createRequire(import.meta.url).resolve('picomatch');

const KIT_SOURCE = `import picomatch from ${JSON.stringify(PICOMATCH_MODULE)};
import { pickJson } from ${JSON.stringify(PICK_JSON_MODULE)};

export const metadata = pickJson('./data.json', ['name', 'version']);
export const matchesEverything = picomatch('*');

export default { checklists: [] };
`;

/** A readyup old enough that no fixture here could have been compiled by it. */
const PRIOR_VERSION = '0.19.2';

/**
 * Exercises `--rebuild` against real esbuild, which is what the check is for: the inputs it catches
 * and the recorded hashes miss are the ones a mocked bundler stands in for.
 */
describe('verifyCommand --rebuild', () => {
  let tempDir: string;
  let originalCwd: string;
  let compiled: CompileResult;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'verify-rebuild-'));
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));
    writeFileSync(path.join(tempDir, 'kit.ts'), KIT_SOURCE);
    // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
    // temporary directory happens to hold a manifest.
    writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));

    originalCwd = process.cwd();
    // `runVerify` names the manifest by a relative path, as a real project's invocation does.
    process.chdir(tempDir);

    // Record the manifest from a real compile, so its hashes are the ones the pipeline produces.
    compiled = await compileConfig(path.join(tempDir, 'kit.ts'), path.join(tempDir, 'kit.js'));
    writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        kits: [
          {
            esbuildVersion: compiled.esbuildVersion,
            name: 'demo',
            path: 'kit.js',
            readyupVersion: VERSION,
            source: 'kit.ts',
            sourceHash: hashFile(path.join(tempDir, 'kit.ts')),
            targetHash: compiled.targetHash,
            ...(Object.keys(compiled.bundledDependencies).length > 0 && {
              bundledDependencies: compiled.bundledDependencies,
            }),
          },
        ],
      }),
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('passes an untouched tree', async () => {
    const { exitCode, stdout } = await runVerify();

    expect(exitCode).toBe(0);
    expect(readPayload(stdout)).toMatchObject({
      passed: true,
      kits: [{ name: 'demo', status: 'ok', sourceStatus: 'ok', rebuildStatus: 'ok' }],
    });
  });

  it('passes an untouched tree from a directory other than the one the kit was compiled in', async () => {
    process.chdir(originalCwd);

    const { exitCode, stdout } = await runVerify({ manifestPath: path.join(tempDir, 'manifest.json') });

    expect(exitCode).toBe(0);
    expect(readPayload(stdout)).toMatchObject({
      passed: true,
      kits: [{ name: 'demo', status: 'ok', sourceStatus: 'ok', rebuildStatus: 'ok' }],
    });
  });

  it('fails a bundle stale only in an inlined JSON file, which both recorded hashes still pass', async () => {
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const { exitCode, stdout } = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdout)).toMatchObject({
      passed: false,
      // The `.ts` and the `.js` are both untouched, so the hash verdicts see nothing wrong. Only the
      // rebuild reads the JSON the bundle inlined, which is the gap the flag exists to close.
      kits: [{ status: 'ok', sourceStatus: 'ok', rebuildStatus: 'mismatch' }],
    });
  });

  it('inlines the edited value into the recompiled bundle rather than the committed one', async () => {
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    await runVerify();

    expect(readFileSync(path.join(tempDir, 'kit.js'), 'utf8')).toContain('1.0.0');
  });

  it('fails a bundle stale only in its version stamp, which both recorded hashes still pass', async () => {
    // A version bump moves neither the source nor the bundle, so the stamp and the hashes recorded for
    // it go stale in agreement and keep matching. Only a recompile reads the version.
    restampBundle(tempDir, PRIOR_VERSION);

    const { exitCode, stdout } = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdout)).toMatchObject({
      passed: false,
      kits: [{ status: 'ok', sourceStatus: 'ok', rebuildStatus: 'mismatch', rebuildCompiledWith: PRIOR_VERSION }],
    });
  });

  it('reports matching recorded versions on a mismatch the record cannot explain', async () => {
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const { stdout } = await runVerify();

    expect(readPayload(stdout).kits[0]).toMatchObject({
      rebuildStatus: 'mismatch',
      rebuildEsbuild: { recorded: installedEsbuildVersion, rebuilt: installedEsbuildVersion },
    });
  });

  it('names a recorded esbuild that differs from the one rebuilding', async () => {
    patchKits(path.join(tempDir, 'manifest.json'), { esbuildVersion: '0.0.1-old' });
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const { stdout } = await runVerify();

    expect(readPayload(stdout).kits[0]).toMatchObject({
      rebuildEsbuild: { recorded: '0.0.1-old', rebuilt: installedEsbuildVersion },
    });
  });

  it('names a dependency whose recorded version the rebuild does not reproduce', async () => {
    patchKits(path.join(tempDir, 'manifest.json'), {
      bundledDependencies: { ...compiled.bundledDependencies, picomatch: '0.0.1-old' },
    });
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const { stdout } = await runVerify();

    expect(readPayload(stdout).kits[0]).toMatchObject({
      rebuildStatus: 'mismatch',
      rebuildDependencyChanges: [
        { name: 'picomatch', recorded: '0.0.1-old', rebuilt: readInstalledPackageVersion('picomatch') },
      ],
    });
  });

  it('fails a hand-edited bundle', async () => {
    writeFileSync(path.join(tempDir, 'kit.js'), 'export default { checklists: [] };\n');

    const { exitCode, stdout } = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdout)).toMatchObject({
      kits: [{ status: 'drift', rebuildStatus: 'mismatch' }],
    });
  });

  it('reports a passing rebuild beside a recorded hash that has gone wrong', async () => {
    patchKits(path.join(tempDir, 'manifest.json'), { targetHash: 'deadbeef' });

    const { exitCode, stdout } = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdout)).toMatchObject({
      kits: [{ status: 'drift', rebuildStatus: 'ok' }],
    });
  });

  it('fails a kit whose source no longer compiles', async () => {
    writeFileSync(path.join(tempDir, 'kit.ts'), 'export default { checklists: [ ;\n');

    const { exitCode, stdout } = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdout)).toMatchObject({
      kits: [{ rebuildStatus: 'failed' }],
    });
  });

  it('leaves every rebuild field out of the payload without the flag', async () => {
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const { exitCode, stdout } = await runVerify({ rebuild: false });

    expect(exitCode).toBe(0);
    expect(readPayload(stdout).kits[0]).not.toHaveProperty('rebuildStatus');
  });
});

// region | Helpers

/** Applies a patch to every kit the manifest records. */
function patchKits(manifestPath: string, patch: Partial<RdyManifestKit>): void {
  const stored: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const manifest = ManifestSchema.parse(stored);
  const kits = manifest.kits.map((kit) => ({ ...kit, ...patch }));
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, kits }));
}

/**
 * Reads the single JSON document the run wrote to stdout.
 *
 * Parsed through the published schema rather than cast, so a payload that does not satisfy the
 * contract fails here rather than reaching an assertion that happens not to look at the bad field.
 */
function readPayload(stdout: string): JsonVerifyOutput {
  const emitted: unknown = JSON.parse(stdout);
  return VerifyOutputSchema.parse(emitted);
}

/**
 * Rewrites the bundle's version stamp and re-records the manifest against the restamped bundle.
 *
 * The stamp, the recorded `targetHash`, and the recorded `readyupVersion` all name the earlier
 * readyup, which is the state a version bump leaves behind.
 */
function restampBundle(tempDir: string, version: string): void {
  const bundlePath = path.join(tempDir, 'kit.js');
  const restamped = readFileSync(bundlePath, 'utf8').replace(
    /__readyupVersion = "[^"]*"/,
    () => `__readyupVersion = ${JSON.stringify(version)}`,
  );
  writeFileSync(bundlePath, restamped);

  patchKits(path.join(tempDir, 'manifest.json'), { readyupVersion: version, targetHash: hashFile(bundlePath) });
}

/**
 * Runs `verify` over the tempdir's manifest with JSON output on and the rebuild check on unless waived,
 * returning its exit code alongside what it wrote.
 */
async function runVerify({ rebuild = true, manifestPath = 'manifest.json' } = {}) {
  using io = captureStdio();

  const rebuildFlag = rebuild ? ['--rebuild'] : [];
  const exitCode = await verifyCommand(['--manifest', manifestPath, ...rebuildFlag, '--json']);

  return { exitCode, stdout: io.stdout };
}

// endregion | Helpers
