import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { version as installedEsbuildVersion } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { compileConfig } from '../../compile/compileConfig.ts';
import type { RdyManifestKit } from '../../manifest/manifestSchema.ts';
import { ManifestSchema } from '../../manifest/manifestSchema.ts';
import type { JsonVerifyOutput } from '../../schemas/verifyOutputSchema.ts';
import { VerifyOutputSchema } from '../../schemas/verifyOutputSchema.ts';
import { VERSION } from '../../version.ts';
import { hashFile } from '../targetHash.ts';
import { verifyCommand } from '../verifyCommand.ts';

/** Absolute specifier for the `pickJson` marker, so a kit written into a tempdir can import it. */
const PICK_JSON_MODULE = path.resolve(import.meta.dirname, '../../compile/pickJson.ts');

const KIT_SOURCE = `import { pickJson } from ${JSON.stringify(PICK_JSON_MODULE)};

export const metadata = pickJson('./data.json', ['name', 'version']);

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
  let stdoutSpy: MockInstance;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'verify-rebuild-'));
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));
    writeFileSync(path.join(tempDir, 'kit.ts'), KIT_SOURCE);

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    originalCwd = process.cwd();
    // esbuild renders each module's path against the working directory, so the fixture is compiled from
    // the directory it is verified from, as a real project is.
    process.chdir(tempDir);

    // Record the manifest from a real compile, so its hashes are the ones the pipeline produces.
    const result = await compileConfig(path.join(tempDir, 'kit.ts'), path.join(tempDir, 'kit.js'));
    writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        kits: [
          {
            esbuildVersion: result.esbuildVersion,
            name: 'demo',
            path: 'kit.js',
            readyupVersion: VERSION,
            source: 'kit.ts',
            sourceHash: hashFile(path.join(tempDir, 'kit.ts')),
            targetHash: result.targetHash,
            ...(Object.keys(result.bundledDependencies).length > 0 && {
              bundledDependencies: result.bundledDependencies,
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
    const exitCode = await runVerify();

    expect(exitCode).toBe(0);
    expect(readPayload(stdoutSpy)).toMatchObject({
      passed: true,
      kits: [{ name: 'demo', status: 'ok', sourceStatus: 'ok', rebuildStatus: 'ok' }],
    });
  });

  it('fails a bundle stale only in an inlined JSON file, which both recorded hashes still pass', async () => {
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const exitCode = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdoutSpy)).toMatchObject({
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

    const exitCode = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdoutSpy)).toMatchObject({
      passed: false,
      kits: [{ status: 'ok', sourceStatus: 'ok', rebuildStatus: 'mismatch', rebuildCompiledWith: PRIOR_VERSION }],
    });
  });

  it('reports matching recorded versions on a mismatch the record cannot explain', async () => {
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    await runVerify();

    expect(readPayload(stdoutSpy).kits[0]).toMatchObject({
      rebuildStatus: 'mismatch',
      rebuildEsbuild: { recorded: installedEsbuildVersion, rebuilt: installedEsbuildVersion },
    });
  });

  it('names a recorded esbuild that differs from the one rebuilding', async () => {
    patchKits(path.join(tempDir, 'manifest.json'), { esbuildVersion: '0.0.1-old' });
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    await runVerify();

    expect(readPayload(stdoutSpy).kits[0]).toMatchObject({
      rebuildEsbuild: { recorded: '0.0.1-old', rebuilt: installedEsbuildVersion },
    });
  });

  it('fails a hand-edited bundle', async () => {
    writeFileSync(path.join(tempDir, 'kit.js'), 'export default { checklists: [] };\n');

    const exitCode = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdoutSpy)).toMatchObject({
      kits: [{ status: 'drift', rebuildStatus: 'mismatch' }],
    });
  });

  it('reports a passing rebuild beside a recorded hash that has gone wrong', async () => {
    patchKits(path.join(tempDir, 'manifest.json'), { targetHash: 'deadbeef' });

    const exitCode = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdoutSpy)).toMatchObject({
      kits: [{ status: 'drift', rebuildStatus: 'ok' }],
    });
  });

  it('fails a kit whose source no longer compiles', async () => {
    writeFileSync(path.join(tempDir, 'kit.ts'), 'export default { checklists: [ ;\n');

    const exitCode = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdoutSpy)).toMatchObject({
      kits: [{ rebuildStatus: 'failed' }],
    });
  });

  it('leaves every rebuild field out of the payload without the flag', async () => {
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const exitCode = await verifyCommand(['--manifest', 'manifest.json', '--json']);

    expect(exitCode).toBe(0);
    expect(readPayload(stdoutSpy).kits[0]).not.toHaveProperty('rebuildStatus');
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
function readPayload(stdoutSpy: MockInstance): JsonVerifyOutput {
  const emitted: unknown = JSON.parse(String(stdoutSpy.mock.calls.at(-1)?.[0]));
  return VerifyOutputSchema.parse(emitted);
}

/**
 * Rewrites the bundle's version stamp and re-records the manifest against the restamped bytes.
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

/** Runs `verify` over the tempdir's manifest with the rebuild check and JSON output on. */
async function runVerify(): Promise<number> {
  return verifyCommand(['--manifest', 'manifest.json', '--rebuild', '--json']);
}

// endregion | Helpers
