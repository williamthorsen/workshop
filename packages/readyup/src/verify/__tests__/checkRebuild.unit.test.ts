import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, it as baseIt, vi } from 'vitest';

const mockBuildBundle = vi.hoisted(() => vi.fn());

vi.mock(import('../../compile/buildBundle.ts'), () => ({
  buildBundle: mockBuildBundle,
}));

import { VERSION } from '../../version.ts';
import { checkRebuild } from '../checkRebuild.ts';
import { hashBytes } from '../targetHash.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rebuild-test-' })),
);

describe(checkRebuild, () => {
  afterEach(() => {
    mockBuildBundle.mockReset();
  });

  it('returns ok when the recompiled bytes match the bundle on disk', async ({ temp }) => {
    const bundle = Buffer.from('compiled output');
    writeKitFiles(temp, bundle);
    mockBuildBundle.mockResolvedValue({ bytes: bundle, inputs: [] });

    const status = await checkRebuild(kit(), temp.dir);

    expect(status.kind).toBe('ok');
  });

  it('returns mismatch with the recompiled and on-disk hashes when the bytes differ', async ({ temp }) => {
    const onDisk = Buffer.from('stale output');
    const rebuilt = Buffer.from('fresh output');
    writeKitFiles(temp, onDisk);
    mockBuildBundle.mockResolvedValue({ bytes: rebuilt, inputs: [] });

    const status = await checkRebuild(kit(), temp.dir);

    expect(status).toStrictEqual({
      kind: 'mismatch',
      expected: hashBytes(rebuilt),
      actual: hashBytes(onDisk),
    });
  });

  it('compares against the on-disk bytes rather than the recorded targetHash', async ({ temp }) => {
    const bundle = Buffer.from('compiled output');
    writeKitFiles(temp, bundle);
    mockBuildBundle.mockResolvedValue({ bytes: bundle, inputs: [] });

    const status = await checkRebuild({ ...kit(), targetHash: 'deadbeef' }, temp.dir);

    expect(status.kind).toBe('ok');
  });

  it('names the compiling version on a mismatch when it differs from the runner', async ({ temp }) => {
    writeKitFiles(temp, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue({ bytes: Buffer.from('fresh output'), inputs: [] });

    const status = await checkRebuild({ ...kit(), readyupVersion: '0.0.1-old' }, temp.dir);

    expect(status).toMatchObject({ kind: 'mismatch', compiledWith: '0.0.1-old' });
  });

  it('omits the compiling version on a mismatch when it matches the runner', async ({ temp }) => {
    writeKitFiles(temp, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue({ bytes: Buffer.from('fresh output'), inputs: [] });

    const status = await checkRebuild({ ...kit(), readyupVersion: VERSION }, temp.dir);

    expect(status).not.toHaveProperty('compiledWith');
  });

  it('compares the recorded esbuild version against the rebuild on a mismatch', async ({ temp }) => {
    writeKitFiles(temp, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue(rebuildResult({ esbuildVersion: '0.29.0' }));

    const status = await checkRebuild({ ...kit(), esbuildVersion: '0.28.1' }, temp.dir);

    expect(status).toMatchObject({ kind: 'mismatch', esbuild: { recorded: '0.28.1', rebuilt: '0.29.0' } });
  });

  it('reports the esbuild comparison even when the recorded version matches the rebuild', async ({ temp }) => {
    writeKitFiles(temp, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue(rebuildResult({ esbuildVersion: '0.29.0' }));

    const status = await checkRebuild({ ...kit(), esbuildVersion: '0.29.0' }, temp.dir);

    expect(status).toMatchObject({ kind: 'mismatch', esbuild: { recorded: '0.29.0', rebuilt: '0.29.0' } });
  });

  it('names each bundled package whose recorded version the rebuild does not reproduce', async ({ temp }) => {
    writeKitFiles(temp, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue(rebuildResult({ bundledDependencies: { added: '2.0.0', zod: '4.0.0' } }));

    const status = await checkRebuild(
      { ...kit(), esbuildVersion: '0.29.0', bundledDependencies: { dropped: '1.0.0', zod: '3.24.1' } },
      temp.dir,
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

  it('omits dependencyChanges when the recorded versions match the rebuild', async ({ temp }) => {
    writeKitFiles(temp, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue(rebuildResult({ bundledDependencies: { zod: '4.0.0' } }));

    const status = await checkRebuild(
      { ...kit(), esbuildVersion: '0.29.0', bundledDependencies: { zod: '4.0.0' } },
      temp.dir,
    );

    expect(status).not.toHaveProperty('dependencyChanges');
  });

  it('omits the toolchain comparison for an entry recording no esbuild version', async ({ temp }) => {
    writeKitFiles(temp, Buffer.from('stale output'));
    mockBuildBundle.mockResolvedValue(rebuildResult({ bundledDependencies: { zod: '4.0.0' } }));

    const status = await checkRebuild(kit(), temp.dir);

    expect(status).not.toHaveProperty('esbuild');
    expect(status).not.toHaveProperty('dependencyChanges');
  });

  it('returns failed with the compile error when the source no longer compiles', async ({ temp }) => {
    writeKitFiles(temp, Buffer.from('compiled output'));
    mockBuildBundle.mockRejectedValue(new Error('Unexpected token'));

    const status = await checkRebuild(kit(), temp.dir);

    expect(status).toStrictEqual({ kind: 'failed', message: 'Unexpected token' });
  });

  it('returns missing when the manifest entry records no source', async ({ temp }) => {
    writeKitFiles(temp, Buffer.from('compiled output'));

    const status = await checkRebuild({ name: 'demo', path: 'demo.js' }, temp.dir);

    expect(status).toMatchObject({ kind: 'missing', reason: expect.stringContaining('no source recorded') });
    expect(mockBuildBundle).not.toHaveBeenCalled();
  });

  it('returns missing when the manifest entry records no compiled path', async ({ temp }) => {
    writeKitFiles(temp, Buffer.from('compiled output'));

    const status = await checkRebuild({ name: 'demo', source: 'demo.ts' }, temp.dir);

    expect(status).toMatchObject({ kind: 'missing', reason: expect.stringContaining('no compiled path recorded') });
  });

  it('returns missing when the recorded source file is gone', async ({ temp }) => {
    temp.write('demo.js', Buffer.from('compiled output'));

    const status = await checkRebuild(kit(), temp.dir);

    expect(status).toMatchObject({ kind: 'missing', reason: expect.stringContaining('source file demo.ts is gone') });
  });

  it('returns missing when the compiled file is gone', async ({ temp }) => {
    temp.write('demo.ts', 'export default {};\n');

    const status = await checkRebuild(kit(), temp.dir);

    expect(status).toMatchObject({ kind: 'missing', reason: expect.stringContaining('compiled file demo.js is gone') });
  });
});

// region | Helpers

/** Returns a manifest entry naming the source and bundle that `writeKitFiles` writes. */
function kit() {
  return { name: 'demo', path: 'demo.js', source: 'demo.ts' };
}

/** Returns a `buildBundle` result that mismatches the bundle that `writeKitFiles` writes. */
function rebuildResult(overrides: { esbuildVersion?: string; bundledDependencies?: Record<string, string> } = {}) {
  return {
    bundledDependencies: {},
    bytes: Buffer.from('fresh output'),
    esbuildVersion: '0.29.0',
    inputs: [],
    ...overrides,
  };
}

/** Writes a kit's source and its compiled bundle into the tree. */
function writeKitFiles(tree: TempTree, bundle: Buffer): void {
  tree.write('demo.ts', 'export default {};\n');
  tree.write('demo.js', bundle);
}

// endregion | Helpers
