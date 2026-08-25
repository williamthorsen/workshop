import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuildBundle = vi.hoisted(() => vi.fn());

vi.mock(import('../../compile/buildBundle.ts'), () => ({
  buildBundle: mockBuildBundle,
}));

import { VERSION } from '../../version.ts';
import { checkRebuild } from '../checkRebuild.ts';
import { hashBytes } from '../targetHash.ts';

describe(checkRebuild, () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'rebuild-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    mockBuildBundle.mockReset();
  });

  it('returns ok when the recompiled bytes match the bundle on disk', async () => {
    const bundle = Buffer.from('compiled output');
    writeKitFiles(tempDir, bundle);
    mockBuildBundle.mockResolvedValue({ bytes: bundle, inputs: [] });

    const status = await checkRebuild(kit(), tempDir);

    expect(status.kind).toBe('ok');
  });

  it('returns mismatch with the recompiled and on-disk hashes when the bytes differ', async () => {
    const onDisk = Buffer.from('stale output');
    const rebuilt = Buffer.from('fresh output');
    writeKitFiles(tempDir, onDisk);
    mockBuildBundle.mockResolvedValue({ bytes: rebuilt, inputs: [] });

    const status = await checkRebuild(kit(), tempDir);

    expect(status).toStrictEqual({
      kind: 'mismatch',
      expected: hashBytes(rebuilt),
      actual: hashBytes(onDisk),
    });
  });

  it('compares against the on-disk bytes rather than the recorded targetHash', async () => {
    const bundle = Buffer.from('compiled output');
    writeKitFiles(tempDir, bundle);
    mockBuildBundle.mockResolvedValue({ bytes: bundle, inputs: [] });

    const status = await checkRebuild({ ...kit(), targetHash: 'deadbeef' }, tempDir);

    expect(status.kind).toBe('ok');
  });

  it('names the compiling version on a mismatch when it differs from the runner', async () => {
    writeKitFiles(tempDir, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue({ bytes: Buffer.from('fresh output'), inputs: [] });

    const status = await checkRebuild({ ...kit(), readyupVersion: '0.0.1-old' }, tempDir);

    expect(status).toMatchObject({ kind: 'mismatch', compiledWith: '0.0.1-old' });
  });

  it('omits the compiling version on a mismatch when it matches the runner', async () => {
    writeKitFiles(tempDir, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue({ bytes: Buffer.from('fresh output'), inputs: [] });

    const status = await checkRebuild({ ...kit(), readyupVersion: VERSION }, tempDir);

    expect(status).not.toHaveProperty('compiledWith');
  });

  it('compares the recorded esbuild version against the rebuild on a mismatch', async () => {
    writeKitFiles(tempDir, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue(rebuildResult({ esbuildVersion: '0.29.0' }));

    const status = await checkRebuild({ ...kit(), esbuildVersion: '0.28.1' }, tempDir);

    expect(status).toMatchObject({ kind: 'mismatch', esbuild: { recorded: '0.28.1', rebuilt: '0.29.0' } });
  });

  it('reports the esbuild comparison even when the recorded version matches the rebuild', async () => {
    writeKitFiles(tempDir, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue(rebuildResult({ esbuildVersion: '0.29.0' }));

    const status = await checkRebuild({ ...kit(), esbuildVersion: '0.29.0' }, tempDir);

    expect(status).toMatchObject({ kind: 'mismatch', esbuild: { recorded: '0.29.0', rebuilt: '0.29.0' } });
  });

  it('names each bundled package whose recorded version the rebuild does not reproduce', async () => {
    writeKitFiles(tempDir, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue(rebuildResult({ bundledDependencies: { added: '2.0.0', zod: '4.0.0' } }));

    const status = await checkRebuild(
      { ...kit(), esbuildVersion: '0.29.0', bundledDependencies: { dropped: '1.0.0', zod: '3.24.1' } },
      tempDir,
    );

    expect(status).toMatchObject({
      kind: 'mismatch',
      dependencyChanges: [
        { name: 'added', rebuilt: '2.0.0' },
        { name: 'dropped', recorded: '1.0.0' },
        { name: 'zod', recorded: '3.24.1', rebuilt: '4.0.0' },
      ],
    });
  });

  it('omits dependencyChanges when the recorded versions match the rebuild', async () => {
    writeKitFiles(tempDir, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue(rebuildResult({ bundledDependencies: { zod: '4.0.0' } }));

    const status = await checkRebuild(
      { ...kit(), esbuildVersion: '0.29.0', bundledDependencies: { zod: '4.0.0' } },
      tempDir,
    );

    expect(status).not.toHaveProperty('dependencyChanges');
  });

  it('omits the toolchain comparison for an entry recording no esbuild version', async () => {
    writeKitFiles(tempDir, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue(rebuildResult({ bundledDependencies: { zod: '4.0.0' } }));

    const status = await checkRebuild(kit(), tempDir);

    expect(status).not.toHaveProperty('esbuild');
    expect(status).not.toHaveProperty('dependencyChanges');
  });

  it('returns failed with the compile error when the source no longer compiles', async () => {
    writeKitFiles(tempDir, Buffer.from('compiled output'));
    mockBuildBundle.mockRejectedValue(new Error('Unexpected token'));

    const status = await checkRebuild(kit(), tempDir);

    expect(status).toStrictEqual({ kind: 'failed', message: 'Unexpected token' });
  });

  it('returns missing when the manifest entry records no source', async () => {
    writeKitFiles(tempDir, Buffer.from('compiled output'));

    const status = await checkRebuild({ name: 'demo', path: 'demo.js' }, tempDir);

    expect(status).toMatchObject({ kind: 'missing', reason: expect.stringContaining('no source recorded') });
    expect(mockBuildBundle).not.toHaveBeenCalled();
  });

  it('returns missing when the manifest entry records no compiled path', async () => {
    writeKitFiles(tempDir, Buffer.from('compiled output'));

    const status = await checkRebuild({ name: 'demo', source: 'demo.ts' }, tempDir);

    expect(status).toMatchObject({ kind: 'missing', reason: expect.stringContaining('no compiled path recorded') });
  });

  it('returns missing when the recorded source file is gone', async () => {
    writeFileSync(path.join(tempDir, 'demo.js'), Buffer.from('compiled output'));

    const status = await checkRebuild(kit(), tempDir);

    expect(status).toMatchObject({ kind: 'missing', reason: expect.stringContaining('source file demo.ts is gone') });
  });

  it('returns missing when the compiled file is gone', async () => {
    writeFileSync(path.join(tempDir, 'demo.ts'), 'export default {};\n');

    const status = await checkRebuild(kit(), tempDir);

    expect(status).toMatchObject({ kind: 'missing', reason: expect.stringContaining('compiled file demo.js is gone') });
  });
});

/** Returns a manifest entry naming the source and bundle that `writeKitFiles` lays down. */
function kit() {
  return { name: 'demo', path: 'demo.js', source: 'demo.ts' };
}

/** Returns a `buildBundle` result that mismatches the bundle `writeKitFiles` lays down. */
function rebuildResult(overrides: { esbuildVersion?: string; bundledDependencies?: Record<string, string> } = {}) {
  return {
    bundledDependencies: {},
    bytes: Buffer.from('fresh output'),
    esbuildVersion: '0.29.0',
    inputs: [],
    ...overrides,
  };
}

/** Writes a kit's source and its compiled bundle into `dir`. */
function writeKitFiles(dir: string, bundle: Buffer): void {
  writeFileSync(path.join(dir, 'demo.ts'), 'export default {};\n');
  writeFileSync(path.join(dir, 'demo.js'), bundle);
}
