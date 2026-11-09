import { describeError } from '@williamthorsen/toolbelt.errors';
import { captureError, captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RdyManifestKit } from '../../manifest/manifestSchema.ts';

const mockCompileConfig = vi.hoisted(() => vi.fn());
const mockRealpathSync = vi.hoisted(() => Object.assign(vi.fn(), { native: vi.fn() }));
const mockCheckDrift = vi.hoisted(() => vi.fn());

vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

vi.mock(import('node:fs'), () => ({
  realpathSync: mockRealpathSync,
}));

vi.mock(import('../../verify/checkDrift.ts'), () => ({
  checkDrift: mockCheckDrift,
}));

import { RdyError } from '../../errors/RdyError.ts';
import { compileKit, type CompileKitArgs } from '../compileKit.ts';
import { compileResult, hashOf, SOURCE_HASH } from '../test-utils/compile-result-fixtures.ts';

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

describe(compileKit, () => {
  beforeEach(() => {
    mockCheckDrift.mockReturnValue({ kind: 'unverified' });
    // No path named by these tests contains a symlink, so a real path is the path itself.
    mockRealpathSync.mockImplementation((target: string) => target);
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
    mockRealpathSync.mockReset();
    mockCheckDrift.mockReset();
  });

  it('returns the compiled kit with its manifest entry and writes the result line', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('/repo/kits/deploy.ts', {
        outputPath: '/repo/kits/deploy.js',
        changed: true,
        targetHash: hashOf('bundle'),
      }),
    );
    using io = captureStdio();

    const outcome = await compileKit(buildArgs({ project: 'packages/app' }));

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
    mockCheckDrift.mockReturnValue({
      kind: 'drift',
      expected: 'old',
      actual: 'new',
      resolvedPath: '/repo/kits/deploy.js',
    });
    using io = captureStdio();

    const outcome = await compileKit(buildArgs({ existingKit: PRIOR_ENTRY }));

    expect(mockCompileConfig).not.toHaveBeenCalled();
    expect(outcome.entry).toBe(PRIOR_ENTRY);
    expect(outcome.kit).toMatchObject({ name: 'deploy', status: 'skipped' });
    expect(io.stdout).toContain('deploy.ts');
  });

  it('reports a failed compile under its subject and returns the prior entry', async () => {
    mockCompileConfig.mockRejectedValue(new Error('syntax error'));
    using io = captureStdio();

    const outcome = await compileKit(
      buildArgs({ existingKit: PRIOR_ENTRY, failureSubject: 'cannot compile deploy.ts' }),
    );

    expect(outcome.entry).toBe(PRIOR_ENTRY);
    expect(outcome.kit).toStrictEqual({ name: 'deploy', status: 'failed', error: 'described: syntax error' });
    expect(io.stderr).toContain('cannot compile deploy.ts: described: syntax error');
  });

  it('raises an internal error when the compile records no input for its entry point', async () => {
    mockCompileConfig.mockResolvedValue(
      compileResult('/repo/kits/other.ts', {
        outputPath: '/repo/kits/deploy.js',
        changed: true,
        targetHash: hashOf('bundle'),
      }),
    );
    using _io = captureStdio();

    const error = await captureError(RdyError, () => compileKit(buildArgs({ existingKit: PRIOR_ENTRY })));

    expect(error.code).toBe('internal');
    expect(error.message).toContain('Compile recorded no input for its entry point');
  });
});

// region | Helpers

/** Returns the arguments of a compile of `/repo/kits/deploy.ts` against a manifest in `/repo`, with overrides. */
function buildArgs(overrides: Partial<CompileKitArgs> = {}): CompileKitArgs {
  return {
    describeFailure: (error: unknown) => `described: ${describeError(error)}`,
    displayInput: 'deploy.ts',
    existingKit: undefined,
    failureSubject: undefined,
    force: false,
    formatOutput: (outputPath: string) => `<${outputPath.split('/').at(-1)}>`,
    inputPath: '/repo/kits/deploy.ts',
    json: false,
    kitName: 'deploy',
    manifestDir: '/repo',
    outputPath: undefined,
    project: undefined,
    resolvedInputPath: '/repo/kits/deploy.ts',
    skipManifest: false,
    ...overrides,
  };
}

// endregion | Helpers
