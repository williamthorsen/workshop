import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());

// The bundler and the import of its output are mocked; configs, manifests, and the drift gate use the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';
import { buildCompileResult, COMPILED, SOURCE_HASH } from '../test-utils/compile-result-fixtures.ts';
import { compileRaising } from '../test-utils/compile-runners.ts';

describe(compileCommand, () => {
  afterEach(() => {
    mockCompileConfig.mockReset();
  });

  // Each compile reports a closure built from another module, so that it records no input for its entry point.
  it('raises an internal error from a single-file compile whose closure omits its entry point', async () => {
    using tree = createTempTree({ 'deploy.ts': COMPILED, 'other.ts': COMPILED }, { prefix: 'rdy-compile-internal-' });
    using _cwd = pointCwdAt(tree.dir);
    mockCompileConfig.mockImplementation(stubCompileOmittingEntry(tree.resolve('other.ts')));

    const { error } = await compileRaising(['deploy.ts']);

    expect(error.code).toBe('internal');
    expect(error.message).toContain('Compile recorded no input for its entry point');
    expect(tree.exists('.readyup/manifest.json')).toBe(false);
  });

  it('raises an internal error from a project sweep whose closure omits a kit entry point', async () => {
    using tree = createTempTree(
      { '.readyup/kits/a.ts': COMPILED, 'other.ts': COMPILED },
      { prefix: 'rdy-compile-internal-' },
    );
    using _cwd = pointCwdAt(tree.dir);
    mockCompileConfig.mockImplementation(stubCompileOmittingEntry(tree.resolve('other.ts')));

    const { error } = await compileRaising([]);

    expect(error.code).toBe('internal');
    expect(error.message).toContain('Compile recorded no input for its entry point');
    expect(tree.exists('.readyup/manifest.json')).toBe(false);
  });
});

// region | Helpers

/** Returns a stand-in for `compileConfig` whose closure records `modulePath` as its only input. */
function stubCompileOmittingEntry(
  modulePath: string,
): (inputPath: string, outputPath?: string) => Promise<CompileResult> {
  return async (inputPath, outputPath) => ({
    ...(await buildCompileResult(inputPath, outputPath)),
    inputs: [{ hash: SOURCE_HASH, kind: 'module', path: modulePath }],
  });
}

// endregion | Helpers
