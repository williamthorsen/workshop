import { realpathSync } from 'node:fs';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { captureError, captureStdio, createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RdyManifestKit } from '../../manifest/manifestSchema.ts';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());

// The bundler and the import of its output are mocked; the drift gate reads the bundles in the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

import { RdyError } from '../../errors/RdyError.ts';
import type { CompileResult } from '../compileConfig.ts';
import { compileKit, type CompileKitArgs } from '../compileKit.ts';
import { buildCompileResult, COMPILED, SOURCE_HASH } from '../test-utils/compile-result-fixtures.ts';

/** An entry whose recorded hash no bundle matches, so that it reads as drift wherever its bundle exists. */
const PRIOR_ENTRY: RdyManifestKit = {
  esbuildVersion: '0.1.0',
  inputs: [],
  name: 'deploy',
  path: 'kits/deploy.js',
  readyupVersion: '0.0.0',
  source: 'kits/deploy.ts',
  sourceHash: 'old',
  targetHash: 'old',
};

/** An entry that records no hash, so that the drift gate lets its kit compile. */
const UNVERIFIED_ENTRY: RdyManifestKit = {
  esbuildVersion: '0.1.0',
  inputs: [],
  name: 'deploy',
  path: 'kits/deploy.js',
  readyupVersion: '0.0.0',
  source: 'kits/deploy.ts',
  sourceHash: 'old',
};

describe(compileKit, () => {
  afterEach(() => {
    mockCompileConfig.mockReset();
  });

  it('returns the compiled kit with its manifest entry and writes the result line', async () => {
    using tree = createTempTree({ 'kits/deploy.ts': COMPILED }, { prefix: 'rdy-compile-kit-' });
    mockCompileConfig.mockImplementation(buildCompileResult);
    using io = captureStdio();

    const outcome = await compileKit(buildArgs(tree, { project: 'packages/app' }));

    expect(outcome.kit).toStrictEqual({ name: 'deploy', project: 'packages/app', status: 'compiled' });
    expect(outcome.entry).toMatchObject({
      name: 'deploy',
      path: 'kits/deploy.js',
      source: 'kits/deploy.ts',
      sourceHash: SOURCE_HASH,
    });
    expect(outcome.warnings).toStrictEqual([]);
    expect(io.stdout).toContain('deploy.ts');
    expect(io.stdout).toContain('<deploy.js>');
  });

  it('skips a drifted kit and returns its prior entry without compiling', async () => {
    using tree = createTempTree(
      { 'kits/deploy.js': 'export default { edited: true };', 'kits/deploy.ts': COMPILED },
      { prefix: 'rdy-compile-kit-' },
    );
    using io = captureStdio();

    const outcome = await compileKit(buildArgs(tree, { existingKit: PRIOR_ENTRY }));

    expect(mockCompileConfig).not.toHaveBeenCalled();
    expect(outcome.entry).toBe(PRIOR_ENTRY);
    expect(outcome.kit).toMatchObject({ name: 'deploy', status: 'skipped' });
    expect(io.stdout).toContain('deploy.ts');
  });

  it('reports a failed compile under its subject and returns the prior entry', async () => {
    using tree = createTempTree({ 'kits/deploy.ts': COMPILED }, { prefix: 'rdy-compile-kit-' });
    mockCompileConfig.mockRejectedValue(new Error('syntax error'));
    using io = captureStdio();

    const outcome = await compileKit(
      buildArgs(tree, { existingKit: UNVERIFIED_ENTRY, failureSubject: 'cannot compile deploy.ts' }),
    );

    expect(outcome.entry).toBe(UNVERIFIED_ENTRY);
    expect(outcome.kit).toStrictEqual({ name: 'deploy', status: 'failed', error: 'described: syntax error' });
    expect(io.stderr).toContain('cannot compile deploy.ts: described: syntax error');
  });

  it('raises an internal error when the compile records no input for its entry point', async () => {
    using tree = createTempTree(
      { 'kits/deploy.ts': COMPILED, 'kits/other.ts': COMPILED },
      { prefix: 'rdy-compile-kit-' },
    );
    // Report a closure built from another module, so that it records no input for the entry point.
    mockCompileConfig.mockImplementation(async (inputPath, outputPath) => ({
      ...(await buildCompileResult(inputPath, outputPath)),
      inputs: [{ hash: SOURCE_HASH, kind: 'module', path: tree.resolve('kits/other.ts') }],
    }));
    using _io = captureStdio();

    const error = await captureError(RdyError, () => compileKit(buildArgs(tree, { existingKit: UNVERIFIED_ENTRY })));

    expect(error.code).toBe('internal');
    expect(error.message).toContain('Compile recorded no input for its entry point');
  });
});

// region | Helpers

/** Returns the arguments of a compile of the tree's `kits/deploy.ts` against a manifest at its root, with overrides. */
function buildArgs(tree: TempTree, overrides: Partial<CompileKitArgs> = {}): CompileKitArgs {
  const inputPath = tree.resolve('kits/deploy.ts');
  return {
    describeFailure: (error: unknown) => `described: ${describeError(error)}`,
    displayInput: 'deploy.ts',
    existingKit: undefined,
    failureSubject: undefined,
    formatOutput: (outputPath: string) => `<${outputPath.split('/').at(-1)}>`,
    inputPath,
    isJson: false,
    kitName: 'deploy',
    manifestDir: realpathSync(tree.dir),
    outputPath: undefined,
    project: undefined,
    resolvedInputPath: realpathSync(inputPath),
    shouldForce: false,
    shouldSkipManifest: false,
    ...overrides,
  };
}

// endregion | Helpers
