import path from 'node:path';

import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCompileConfig = vi.hoisted(() => vi.fn<(inputPath: string, outputPath?: string) => Promise<CompileResult>>());

// The bundler and the import of its output are mocked; configs, manifests, the drift gate, and discovery use the tree.
vi.mock(import('../compileConfig.ts'), () => ({
  compileConfig: mockCompileConfig,
}));

import { CompileOutputSchema } from '../../schemas/compileOutputSchema.ts';
import { compileCommand } from '../compileCommand.ts';
import type { CompileResult } from '../compileConfig.ts';
import { buildCompileResult, COMPILED, hashOf } from '../test-utils/compile-result-fixtures.ts';
import { compile } from '../test-utils/compile-runners.ts';

/** Two kit sources, swept in the order alpha then beta. */
const BATCH_SOURCES = {
  '.readyup/kits/alpha.ts': 'export default {};',
  '.readyup/kits/beta.ts': 'export default {};',
};

describe(compileCommand, () => {
  beforeEach(() => {
    mockCompileConfig.mockImplementation(buildCompileResult);
  });

  afterEach(() => {
    mockCompileConfig.mockReset();
  });

  describe('--json', () => {
    it('reports every kit status on stdout and keeps prose on stderr', async () => {
      using tree = createTempTree(BATCH_SOURCES, { prefix: 'rdy-compile-json-' });
      using _cwd = pointCwdAt(tree.dir);
      mockCompileConfig.mockRejectedValueOnce(new Error('alpha is not valid TypeScript'));

      const { exitCode, stdout, stdoutChunks } = await compile(['--json']);

      expect(exitCode).toBe(1);
      expect(stdoutChunks).toHaveLength(1);
      expect(CompileOutputSchema.parse(JSON.parse(stdout))).toStrictEqual({
        schemaVersion: 1,
        passed: false,
        kits: [
          { name: 'alpha', status: 'failed', error: 'alpha is not valid TypeScript' },
          { name: 'beta', status: 'compiled' },
        ],
      });
    });

    it('reports a clean single-file compile as passed', async () => {
      using tree = createTempTree({ 'deploy.ts': 'export default {};' }, { prefix: 'rdy-compile-json-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile(['deploy.ts', '--json']);

      expect(exitCode).toBe(0);
      expect(CompileOutputSchema.parse(JSON.parse(stdout))).toMatchObject({
        passed: true,
        kits: [{ name: 'deploy', status: 'compiled' }],
      });
    });

    it('reports a drift-skipped kit with the reason it was left alone', async () => {
      // Edit the bundle since the manifest recorded its hash, so that the drift gate skips the kit.
      using tree = createTempTree(
        {
          '.readyup/kits/deploy.js': 'export default { edited: true };',
          '.readyup/kits/deploy.ts': 'export default {};',
          '.readyup/manifest.json': JSON.stringify({
            version: 1,
            kits: [{ name: 'deploy', path: 'kits/deploy.js', targetHash: hashOf(COMPILED) }],
          }),
        },
        { prefix: 'rdy-compile-json-' },
      );
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile(['.readyup/kits/deploy.ts', '--json']);

      expect(exitCode).toBe(1);
      expect(CompileOutputSchema.parse(JSON.parse(stdout))).toMatchObject({
        passed: false,
        kits: [{ name: 'deploy', status: 'skipped', error: expect.stringContaining('drifted') }],
      });
    });
  });

  describe('inlined JSON warnings', () => {
    beforeEach(() => {
      mockCompileConfig.mockImplementation(buildResultInliningJson);
    });

    it('warns on stderr after a single-file compile, which still passes', async () => {
      using tree = createTempTree({ 'deploy.ts': 'export default {};' }, { prefix: 'rdy-compile-json-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stderr } = await compile(['deploy.ts']);

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Warning: kit "deploy" bundles all of package.json, imported by deploy.ts,');
    });

    it('reports the warning in the payload of a single-file compile under --json', async () => {
      using tree = createTempTree({ 'deploy.ts': 'export default {};' }, { prefix: 'rdy-compile-json-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout, stderr } = await compile(['deploy.ts', '--json']);

      expect(exitCode).toBe(0);
      expect(CompileOutputSchema.parse(JSON.parse(stdout))).toStrictEqual({
        schemaVersion: 1,
        passed: true,
        kits: [{ name: 'deploy', status: 'compiled' }],
        warnings: [
          {
            code: 'json-inlined',
            message: expect.stringContaining('kit "deploy" bundles all of package.json'),
            remedy: expect.stringContaining('pickJson'),
          },
        ],
      });
      expect(stderr).toContain('Warning: kit "deploy"');
    });

    it('collects the warnings of every kit in a batch compile under --json', async () => {
      using tree = createTempTree(BATCH_SOURCES, { prefix: 'rdy-compile-json-' });
      using _cwd = pointCwdAt(tree.dir);

      const { exitCode, stdout } = await compile(['--json']);

      expect(exitCode).toBe(0);
      expect(CompileOutputSchema.parse(JSON.parse(stdout))).toMatchObject({
        passed: true,
        warnings: [
          { code: 'json-inlined', message: expect.stringContaining('kit "alpha"') },
          { code: 'json-inlined', message: expect.stringContaining('kit "beta"') },
        ],
      });
    });

    it("writes each kit's warnings on stderr after its result line and before the next kit's", async () => {
      using tree = createTempTree(BATCH_SOURCES, { prefix: 'rdy-compile-json-' });
      using _cwd = pointCwdAt(tree.dir);

      const { stderr } = await compile(['--json']);

      const positions = [
        stderr.indexOf('alpha.ts'),
        stderr.indexOf('Warning: kit "alpha"'),
        stderr.indexOf('beta.ts'),
        stderr.indexOf('Warning: kit "beta"'),
      ];
      expect(positions).not.toContain(-1);
      expect(positions).toStrictEqual(positions.toSorted((a, b) => a - b));
    });

    it('raises no warning for a kit that fails validation', async () => {
      using tree = createTempTree({ '.readyup/kits/alpha.ts': 'export default {};' }, { prefix: 'rdy-compile-json-' });
      using _cwd = pointCwdAt(tree.dir);
      mockCompileConfig.mockRejectedValue(new Error('Kit must export a default RdyKit'));

      const { exitCode, stdout, stderr } = await compile(['--json']);

      expect(exitCode).toBe(1);
      expect(CompileOutputSchema.parse(JSON.parse(stdout))).not.toHaveProperty('warnings');
      expect(stderr).not.toContain('bundles all of');
    });
  });
});

// region | Helpers

/** Returns `buildCompileResult`'s result with a bundle that includes `package.json` whole, imported by the entry. */
async function buildResultInliningJson(inputPath: string, outputPath?: string): Promise<CompileResult> {
  return {
    ...(await buildCompileResult(inputPath, outputPath)),
    inlinedJson: [{ importers: [path.resolve(inputPath)], path: path.resolve('package.json') }],
  };
}

// endregion | Helpers
