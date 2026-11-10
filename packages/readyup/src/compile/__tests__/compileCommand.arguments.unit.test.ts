import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());

// The bundler and the import of its output are mocked; configs and manifests use the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';
import { buildCompileResult, COMPILED } from '../test-utils/compile-result-fixtures.ts';
import { compile, compileRaising } from '../test-utils/compile-runners.ts';

const TREE_OPTIONS = { prefix: 'rdy-compile-arguments-' };

describe(compileCommand, () => {
  beforeEach(() => {
    mockCompileConfig.mockImplementation(buildCompileResult);
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
  });

  it('passes --output value to compileConfig', async () => {
    using tree = createTempTree({ 'input.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);

    const { exitCode } = await compile(['input.ts', '--output', 'custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
    expect(tree.exists('custom.js')).toBe(true);
  });

  it('passes --output=value inline form to compileConfig', async () => {
    using tree = createTempTree({ 'input.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);

    const { exitCode } = await compile(['input.ts', '--output=custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
    expect(tree.exists('custom.js')).toBe(true);
  });

  it('passes -o value short form to compileConfig', async () => {
    using tree = createTempTree({ 'input.ts': COMPILED }, TREE_OPTIONS);
    using _cwd = pointCwdAt(tree.dir);

    const { exitCode } = await compile(['input.ts', '-o', 'custom.js']);

    expect(exitCode).toBe(0);
    expect(mockCompileConfig).toHaveBeenCalledWith('input.ts', 'custom.js');
    expect(tree.exists('custom.js')).toBe(true);
  });

  // Each usage error is raised while parsing arguments, before the command reads a config or a file.
  it('reports a usage error when --output is provided without a value', async () => {
    const { error } = await compileRaising(['input.ts', '--output']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--output requires a path argument');
  });

  it('reports a usage error when --output is given an empty value', async () => {
    const { error } = await compileRaising(['input.ts', '--output=']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--output requires a path argument');
  });

  it('reports a usage error for unknown flags', async () => {
    const { error } = await compileRaising(['input.ts', '--verbose']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain("Unknown option '--verbose'");
  });

  it('reports a usage error when multiple positional arguments are provided', async () => {
    const { error } = await compileRaising(['a.ts', 'b.ts']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('Too many arguments');
  });

  it('reports a usage error when --config is given an empty value', async () => {
    const { error } = await compileRaising(['--config=']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--config requires a path argument');
  });

  it('reports a usage error when --output is given without an input file', async () => {
    const { error } = await compileRaising(['--output', 'out.js']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('--output requires an input file');
  });

  it('reports a usage error for --all (removed flag)', async () => {
    const { error } = await compileRaising(['--all']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain("Unknown option '--all'");
  });
});
