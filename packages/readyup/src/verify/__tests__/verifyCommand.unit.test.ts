import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { beforeEach, describe, expect, it } from 'vitest';

import { richFormatter } from '../../layout/formatter.ts';
import { VerifyOutputSchema } from '../../schemas/verifyOutputSchema.ts';
import type { DriftStatus } from '../checkDrift.ts';
import { createVerifyFakes, type VerifyFakes } from '../test-utils/createVerifyFakes.ts';
import { buildConfig, verify, verifyRaising } from '../test-utils/verify-harness.ts';
import { verifyCommand } from '../verifyCommand.ts';

const OK = richFormatter.tokens.passed.text;
const FAILED = richFormatter.tokens.failedError.text;
const UNVERIFIED = richFormatter.tokens.skippedOptional.text;
const FIX = richFormatter.tokens.fix.text;

describe(verifyCommand, () => {
  let fakes: VerifyFakes;

  beforeEach(() => {
    fakes = createVerifyFakes();
  });

  it('returns 0 when every kit is ok', async () => {
    fakes.readManifest.mockReturnValue({
      version: 1,
      kits: [
        { name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' },
        { name: 'beta', path: 'beta.js', targetHash: 'bbbb2222' },
      ],
    });
    fakes.checkDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });

    const { exitCode, stdout } = await verify([], fakes);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${OK} alpha`);
    expect(stdout).toContain(`${OK} beta`);
    expect(stdout).not.toContain('failed verification');
  });

  it('returns 1 when any kit has drift', async () => {
    fakes.readManifest.mockReturnValue({
      version: 1,
      kits: [
        { name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' },
        { name: 'beta', path: 'beta.js', targetHash: 'bbbb2222' },
      ],
    });
    fakes.checkDrift
      .mockReturnValueOnce({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      })
      .mockReturnValueOnce({ kind: 'ok', targetHash: 'bbbb2222' });

    const { exitCode, stdout } = await verify([], fakes);

    expect(exitCode).toBe(1);
    expect(stdout).toContain(`${FAILED} alpha\n   drift`);
    expect(stdout).toContain('expected aaaa1111, got aaaa9999');
    expect(stdout).toContain('1 of 2 kits failed verification');
  });

  it('returns 1 when any kit is missing', async () => {
    fakes.readManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111' }],
    });
    fakes.checkDrift.mockReturnValue({ kind: 'missing', resolvedPath: '/abs/alpha.js' });

    const { exitCode, stdout } = await verify([], fakes);

    expect(exitCode).toBe(1);
    expect(stdout).toContain(`${FAILED} alpha\n   compiled file missing`);
  });

  it('returns 0 when a kit is unverified (no targetHash)', async () => {
    fakes.readManifest.mockReturnValue({
      version: 1,
      kits: [{ name: 'alpha', path: 'alpha.js' }],
    });
    fakes.checkDrift.mockReturnValue({ kind: 'unverified' });

    const { exitCode, stdout } = await verify([], fakes);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${UNVERIFIED} alpha \u{00B7} unverified`);
  });

  it('returns 0 and reports no-kits message when the manifest is empty', async () => {
    fakes.readManifest.mockReturnValue({ version: 1, kits: [] });

    const { exitCode, stdout } = await verify([], fakes);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('(no kits in manifest)');
    expect(fakes.checkDrift).not.toHaveBeenCalled();
  });

  describe('uncompiled sources', () => {
    beforeEach(() => {
      fakes.checkDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
    });

    it('fails a selected source that the manifest does not record, naming it and the remedy', async () => {
      using tree = createTempTree({ 'kits/alpha.ts': '', 'kits/beta.ts': '' });
      fakes.loadConfig.mockResolvedValue(buildConfig(tree.resolve('kits')));
      fakes.readManifest.mockReturnValue({ version: 1, kits: [{ name: 'alpha', path: 'kits/alpha.js' }] });

      const { exitCode, stdout } = await verify(['--manifest', tree.resolve('manifest.json')], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(
        `${FAILED} beta\n   source not compiled (kits/beta.ts)\n   ${FIX} Run \`rdy compile\` to compile it.`,
      );
      expect(stdout).not.toContain(`${FAILED} alpha`);
      expect(stdout).toContain('1 of 2 kits failed verification');
    });

    it('fails an empty manifest beside a selected source, as a first compile that failed every kit leaves it', async () => {
      using tree = createTempTree({ 'kits/alpha.ts': '' });
      fakes.loadConfig.mockResolvedValue(buildConfig(tree.resolve('kits')));
      fakes.readManifest.mockReturnValue({ version: 1, kits: [] });

      const { exitCode, stdout } = await verify(['--manifest', tree.resolve('manifest.json')], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`(no kits in manifest)\n${FAILED} alpha\n`);
      expect(stdout).toContain('1 of 1 kits failed verification');
    });

    it('fails an uncompiled source under --rebuild as well', async () => {
      using tree = createTempTree({ 'kits/alpha.ts': '' });
      fakes.loadConfig.mockResolvedValue(buildConfig(tree.resolve('kits')));
      fakes.readManifest.mockReturnValue({ version: 1, kits: [] });

      const { exitCode, stdout } = await verify(['--rebuild', '--manifest', tree.resolve('manifest.json')], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} alpha\n   source not compiled`);
    });

    it('ignores a source that the compile settings leave out', async () => {
      using tree = createTempTree({ 'kits/alpha.ts': '', 'kits/shared/util.ts': '', 'kits/draft.ts': '' });
      fakes.loadConfig.mockResolvedValue(
        buildConfig(tree.resolve('kits'), { include: ['alpha.ts', 'shared/**'], exclude: ['shared/**'] }),
      );
      fakes.readManifest.mockReturnValue({ version: 1, kits: [{ name: 'alpha', path: 'kits/alpha.js' }] });

      const { exitCode, stdout } = await verify(['--manifest', tree.resolve('manifest.json')], fakes);

      expect(exitCode).toBe(0);
      expect(stdout).not.toContain('source not compiled');
    });

    it('reports each uncompiled source under --json, failing the payload', async () => {
      using tree = createTempTree({ 'kits/alpha.ts': '', 'kits/ops/deploy.ts': '' });
      fakes.loadConfig.mockResolvedValue(buildConfig(tree.resolve('kits')));
      fakes.readManifest.mockReturnValue({ version: 1, kits: [{ name: 'alpha', path: 'kits/alpha.js' }] });

      const { exitCode, stdout } = await verify(['--json', '--manifest', tree.resolve('manifest.json')], fakes);

      expect(exitCode).toBe(1);
      const payload = VerifyOutputSchema.parse(JSON.parse(stdout));
      expect(payload.passed).toBe(false);
      expect(payload.uncompiled).toStrictEqual([{ name: 'ops/deploy', source: path.join('kits', 'ops', 'deploy.ts') }]);
    });

    it('omits the uncompiled list from the JSON payload when every source is recorded', async () => {
      fakes.readManifest.mockReturnValue({ version: 1, kits: [{ name: 'alpha', path: 'alpha.js' }] });

      const { stdout } = await verify(['--json'], fakes);

      expect(JSON.parse(stdout)).not.toHaveProperty('uncompiled');
    });

    it('selects sources under the config named by --config', async () => {
      fakes.readManifest.mockReturnValue({ version: 1, kits: [] });

      await verify(['--config', 'custom/readyup.config.ts'], fakes);

      expect(fakes.loadConfig).toHaveBeenCalledWith({
        fromDir: process.cwd(),
        overridePath: path.resolve('custom/readyup.config.ts'),
      });
    });

    it("selects sources from the manifest's own project when the manifest sits at the default path", async () => {
      using tree = createTempTree({ 'pkg/.readyup/kits/alpha.ts': '', 'pkg/.readyup/kits/beta.ts': '' });
      fakes.loadConfig.mockResolvedValue(buildConfig('.readyup/kits'));
      fakes.readManifest.mockReturnValue({ version: 1, kits: [{ name: 'alpha', path: 'kits/alpha.js' }] });

      const { exitCode, stdout } = await verify(['--manifest', tree.resolve('pkg/.readyup/manifest.json')], fakes);

      expect(fakes.loadConfig).toHaveBeenCalledWith({ fromDir: tree.resolve('pkg') });
      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} beta\n   source not compiled (kits/beta.ts)`);
      expect(stdout).not.toContain(`${FAILED} alpha`);
    });

    it('reports a config error when the config cannot be evaluated', async () => {
      fakes.readManifest.mockReturnValue({ version: 1, kits: [] });
      fakes.loadConfig.mockRejectedValue(new Error('Unexpected token in readyup.config.ts'));

      const { error } = await verifyRaising([], fakes);

      expect(error.code).toBe('config');
      expect(error.message).toContain('Unexpected token');
    });
  });

  describe('unified vocabulary', () => {
    /** Every verdict that the command can report, so that one sweep covers each of its lines. */
    const verdicts: DriftStatus[] = [
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
          fakes.readManifest.mockReturnValue({
            version: 1,
            kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111', source: 'alpha.ts' }],
          });
          fakes.checkDrift.mockReturnValue(verdict);
          const { stdout } = await verify([], fakes);
          written.push(stdout);
        }

        expect(written.join('\n')).not.toContain(retired);
      },
    );

    it('renders a section heading rather than a colon-terminated header', async () => {
      fakes.readManifest.mockReturnValue({ version: 1, kits: [] });

      const { stdout } = await verify([], fakes);

      expect(stdout).toContain('\u{2500}\u{2500} Verifying kits against ');
    });

    it('leaves a wholly verified kit with nothing beyond its token', async () => {
      fakes.readManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', targetHash: 'aaaa1111', source: 'alpha.ts', sourceHash: '5555aaaa' }],
      });
      fakes.checkDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
      fakes.checkSourceDrift.mockReturnValue({ kind: 'ok', sourceHash: '5555aaaa' });

      const { stdout } = await verify([], fakes);

      expect(stdout).toContain(`${OK} alpha\n`);
    });
  });
});
