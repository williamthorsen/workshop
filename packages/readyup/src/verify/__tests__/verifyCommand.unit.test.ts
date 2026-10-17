import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadManifest = vi.hoisted(() => vi.fn());
const mockCheckDrift = vi.hoisted(() => vi.fn());
const mockCheckInputDrift = vi.hoisted(() => vi.fn());
const mockCheckSourceDrift = vi.hoisted(() => vi.fn());
const mockCheckRebuild = vi.hoisted(() => vi.fn());
const mockLoadEsbuild = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());

vi.mock(import('../../manifest/readManifest.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

vi.mock(import('../../config/loadConfig.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/loadConfig.ts')>();
  return { ...actual, loadConfig: mockLoadConfig };
});

vi.mock(import('../checkDrift.ts'), () => ({
  checkDrift: mockCheckDrift,
}));

vi.mock(import('../checkInputDrift.ts'), () => ({
  checkInputDrift: mockCheckInputDrift,
}));

vi.mock(import('../checkSourceDrift.ts'), () => ({
  checkSourceDrift: mockCheckSourceDrift,
}));

vi.mock(import('../checkRebuild.ts'), () => ({
  checkRebuild: mockCheckRebuild,
}));

vi.mock(import('../../compile/loadEsbuild.ts'), () => ({
  loadEsbuild: mockLoadEsbuild,
}));

vi.mock(import('../../portable/buildInstallCommand.ts'), () => ({
  buildInstallCommand: (moduleName: string) => `npm install --save-dev ${moduleName}`,
}));

import { richFormatter } from '../../layout/formatter.ts';
import { VerifyOutputSchema } from '../../schemas/verifyOutputSchema.ts';
import { buildConfig, verify, verifyRaising } from '../test-utils/verify-harness.ts';
import { verifyCommand } from '../verifyCommand.ts';

const OK = richFormatter.tokens.passed.text;
const FAILED = richFormatter.tokens.failedError.text;
const UNVERIFIED = richFormatter.tokens.skippedOptional.text;
const FIX = richFormatter.tokens.fix.text;

/** A source directory that does not exist, so that a test which writes no sources selects none. */
const ABSENT_SRC_DIR = '/nonexistent/readyup-verify-sources';

describe(verifyCommand, () => {
  beforeEach(() => {
    mockCheckInputDrift.mockReturnValue({ kind: 'unverified' });
    mockCheckSourceDrift.mockReturnValue({ kind: 'unverified' });
    mockLoadEsbuild.mockResolvedValue({ build: vi.fn() });
    mockLoadConfig.mockResolvedValue(buildConfig(ABSENT_SRC_DIR));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockReadManifest.mockReset();
    mockCheckDrift.mockReset();
    mockCheckInputDrift.mockReset();
    mockCheckSourceDrift.mockReset();
    mockCheckRebuild.mockReset();
    mockLoadEsbuild.mockReset();
    mockLoadConfig.mockReset();
  });

  it('returns 0 when every kit is ok', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [
        { name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' },
        { name: 'beta', path: 'beta.js', targetHash: 'bbbb2222' },
      ],
    });
    mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });

    const { exitCode, stdout } = await verify([]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${OK} alpha`);
    expect(stdout).toContain(`${OK} beta`);
    expect(stdout).not.toContain('failed verification');
  });

  it('returns 1 when any kit has drift', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [
        { name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' },
        { name: 'beta', path: 'beta.js', targetHash: 'bbbb2222' },
      ],
    });
    mockCheckDrift
      .mockReturnValueOnce({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      })
      .mockReturnValueOnce({ kind: 'ok', targetHash: 'bbbb2222' });

    const { exitCode, stdout } = await verify([]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain(`${FAILED} alpha\n   drift`);
    expect(stdout).toContain('expected aaaa1111, got aaaa9999');
    expect(stdout).toContain('1 of 2 kits failed verification');
  });

  it('returns 1 when any kit is missing', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' }],
    });
    mockCheckDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/alpha.js' });

    const { exitCode, stdout } = await verify([]);

    expect(exitCode).toBe(1);
    expect(stdout).toContain(`${FAILED} alpha\n   compiled file missing`);
  });

  it('returns 0 when a kit is unverified (no targetHash)', async () => {
    mockReadManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'alpha', path: 'alpha.js' }],
    });
    mockCheckDrift.mockReturnValue({ kind: 'unverified' });

    const { exitCode, stdout } = await verify([]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${UNVERIFIED} alpha \u{00B7} unverified`);
  });

  it('returns 0 and reports no-kits message when the manifest is empty', async () => {
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });

    const { exitCode, stdout } = await verify([]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('(no kits in manifest)');
    expect(mockCheckDrift).not.toHaveBeenCalled();
  });

  describe('uncompiled sources', () => {
    beforeEach(() => {
      mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
    });

    it('fails a selected source that the manifest does not record, naming it and the remedy', async () => {
      using tree = createTempTree({ 'kits/alpha.ts': '', 'kits/beta.ts': '' });
      mockLoadConfig.mockResolvedValue(buildConfig(tree.resolve('kits')));
      mockReadManifest.mockReturnValue({ version: 1, kits: [{ name: 'alpha', path: 'kits/alpha.js' }] });

      const { exitCode, stdout } = await verify(['--manifest', tree.resolve('manifest.json')]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(
        `${FAILED} beta\n   source not compiled (kits/beta.ts)\n   ${FIX} Run \`rdy compile\` to compile it.`,
      );
      expect(stdout).not.toContain(`${FAILED} alpha`);
      expect(stdout).toContain('1 of 2 kits failed verification');
    });

    it('fails an empty manifest beside a selected source, as a first compile that failed every kit leaves it', async () => {
      using tree = createTempTree({ 'kits/alpha.ts': '' });
      mockLoadConfig.mockResolvedValue(buildConfig(tree.resolve('kits')));
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { exitCode, stdout } = await verify(['--manifest', tree.resolve('manifest.json')]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`(no kits in manifest)\n${FAILED} alpha\n`);
      expect(stdout).toContain('1 of 1 kits failed verification');
    });

    it('fails an uncompiled source under --rebuild as well', async () => {
      using tree = createTempTree({ 'kits/alpha.ts': '' });
      mockLoadConfig.mockResolvedValue(buildConfig(tree.resolve('kits')));
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { exitCode, stdout } = await verify(['--rebuild', '--manifest', tree.resolve('manifest.json')]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} alpha\n   source not compiled`);
    });

    it('ignores a source that the compile settings leave out', async () => {
      using tree = createTempTree({ 'kits/alpha.ts': '', 'kits/shared/util.ts': '', 'kits/draft.ts': '' });
      mockLoadConfig.mockResolvedValue(
        buildConfig(tree.resolve('kits'), { include: ['alpha.ts', 'shared/**'], exclude: ['shared/**'] }),
      );
      mockReadManifest.mockReturnValue({ version: 1, kits: [{ name: 'alpha', path: 'kits/alpha.js' }] });

      const { exitCode, stdout } = await verify(['--manifest', tree.resolve('manifest.json')]);

      expect(exitCode).toBe(0);
      expect(stdout).not.toContain('source not compiled');
    });

    it('reports each uncompiled source under --json, failing the payload', async () => {
      using tree = createTempTree({ 'kits/alpha.ts': '', 'kits/ops/deploy.ts': '' });
      mockLoadConfig.mockResolvedValue(buildConfig(tree.resolve('kits')));
      mockReadManifest.mockReturnValue({ version: 1, kits: [{ name: 'alpha', path: 'kits/alpha.js' }] });

      const { exitCode, stdout } = await verify(['--json', '--manifest', tree.resolve('manifest.json')]);

      expect(exitCode).toBe(1);
      const payload = VerifyOutputSchema.parse(JSON.parse(stdout));
      expect(payload.passed).toBe(false);
      expect(payload.uncompiled).toStrictEqual([{ name: 'ops/deploy', source: path.join('kits', 'ops', 'deploy.ts') }]);
    });

    it('omits the uncompiled list from the JSON payload when every source is recorded', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [{ name: 'alpha', path: 'alpha.js' }] });

      const { stdout } = await verify(['--json']);

      expect(JSON.parse(stdout)).not.toHaveProperty('uncompiled');
    });

    it('selects sources under the config named by --config', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      await verify(['--config', 'custom/readyup.config.ts']);

      expect(mockLoadConfig).toHaveBeenCalledWith({
        fromDir: process.cwd(),
        overridePath: path.resolve('custom/readyup.config.ts'),
      });
    });

    it("selects sources from the manifest's own project when the manifest sits at the default path", async () => {
      using tree = createTempTree({ 'pkg/.readyup/kits/alpha.ts': '', 'pkg/.readyup/kits/beta.ts': '' });
      mockLoadConfig.mockResolvedValue(buildConfig('.readyup/kits'));
      mockReadManifest.mockReturnValue({ version: 1, kits: [{ name: 'alpha', path: 'kits/alpha.js' }] });

      const { exitCode, stdout } = await verify(['--manifest', tree.resolve('pkg/.readyup/manifest.json')]);

      expect(mockLoadConfig).toHaveBeenCalledWith({ fromDir: tree.resolve('pkg') });
      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} beta\n   source not compiled (kits/beta.ts)`);
      expect(stdout).not.toContain(`${FAILED} alpha`);
    });

    it('reports a config error when the config cannot be evaluated', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });
      mockLoadConfig.mockRejectedValue(new Error('Unexpected token in readyup.config.ts'));

      const { error } = await verifyRaising([]);

      expect(error.code).toBe('config');
      expect(error.message).toContain('Unexpected token');
    });
  });

  describe('unified vocabulary', () => {
    /** Every verdict that the command can report, so that one sweep covers each of its lines. */
    const verdicts = [
      { kind: 'ok', targetHash: 'aaaa1111' },
      { kind: 'drift', expected: 'aaaa1111', actual: 'aaaa9999', resolvedPath: '/abs/alpha.js' },
      { kind: 'missing', resolvedPath: '/abs/alpha.js' },
      { kind: 'unverified' },
    ];

    it.each(['\u{26A0}', '\u{2753}', '\u{2796}', '\u{FE0F}', '\u{2014}'])(
      'renders no %s for any verdict',
      async (retired) => {
        const written: string[] = [];
        for (const verdict of verdicts) {
          mockReadManifest.mockReturnValue({
            version: 1,
            kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111', source: 'alpha.ts' }],
          });
          mockCheckDrift.mockReturnValue(verdict);
          const { stdout } = await verify([]);
          written.push(stdout);
        }

        expect(written.join('\n')).not.toContain(retired);
      },
    );

    it('renders a section heading rather than a colon-terminated header', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { stdout } = await verify([]);

      expect(stdout).toContain('\u{2500}\u{2500} Verifying kits against ');
    });

    it('leaves a wholly verified kit with nothing beyond its token', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111', source: 'alpha.ts', sourceHash: '5555aaaa' }],
      });
      mockCheckDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
      mockCheckSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });

      const { stdout } = await verify([]);

      expect(stdout).toContain(`${OK} alpha\n`);
    });
  });
});
