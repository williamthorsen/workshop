import { beforeEach, describe, expect, it } from 'vitest';

import { configError } from '../../errors/RdyError.ts';
import { richFormatter } from '../../layout/formatter.ts';
import { ManifestNotFoundError } from '../../manifest/readManifest.ts';
import { createVerifyFakes, type VerifyFakes } from '../test-utils/createVerifyFakes.ts';
import { verify, verifyRaising } from '../test-utils/verify-harness.ts';
import { verifyCommand } from '../verifyCommand.ts';

const OK = richFormatter.tokens.passed.text;
const FAILED = richFormatter.tokens.failedError.text;
const FIX = richFormatter.tokens.fix.text;

describe(verifyCommand, () => {
  let fakes: VerifyFakes;

  beforeEach(() => {
    fakes = createVerifyFakes();
  });

  describe('remedies', () => {
    /** Arranges a manifest naming one kit, leaving each test to drive whichever axes it is about. */
    function arrangeSingleKit(): void {
      fakes.readManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'alpha', path: 'alpha.js', source: 'alpha.ts', targetHash: 'aaaa1111' }],
      });
    }

    it("closes a failing kit's block with what to do about its verdict", async () => {
      arrangeSingleKit();
      fakes.checkDrift.mockReturnValue({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      });

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(
        `${FAILED} alpha\n   drift (expected aaaa1111, got aaaa9999)` +
          `\n   ${FIX} Move the edits into the source, then run \`rdy compile --force\`.`,
      );
    });

    it('states every verdict before the first remedy, so that the diagnosis appears in one piece', async () => {
      arrangeSingleKit();
      fakes.checkDrift.mockReturnValue({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      });
      fakes.checkInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [{ kind: 'inline', path: 'pkg.json', reason: 'unprojectable', detail: 'Path not found: version' }],
      });

      const { stdout } = await verify([], fakes);

      expect(stdout).toContain(
        `${FAILED} alpha\n   drift (expected aaaa1111, got aaaa9999)` +
          `\n   input unprojectable: pkg.json (Path not found: version)` +
          `\n   ${FIX} Move the edits into the source, then run \`rdy compile --force\`.` +
          `\n   ${FIX} Restore the picked fields in pkg.json, or repoint the kit's \`pickJson\` call.`,
      );
    });

    it('names a remedy once for a kit that needs it on two axes', async () => {
      arrangeSingleKit();
      fakes.checkDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });
      fakes.checkSourceDrift.mockReturnValue({
        kind: 'stale',
        expected: '5555aaaa',
        actual: '6666bbbb',
        resolvedPath: '/abs/alpha.ts',
      });
      fakes.checkInputDrift.mockReturnValue({
        kind: 'stale',
        failures: [{ kind: 'module', path: 'shared.ts', reason: 'changed', expected: '7777', actual: '8888' }],
      });

      const { stdout } = await verify([], fakes);

      expect(stdout.match(/Run `rdy compile` to rebuild it\./g)).toHaveLength(1);
    });

    it('leaves a passing kit its bare line, having nothing for it to fix', async () => {
      arrangeSingleKit();
      fakes.checkDrift.mockReturnValue({ kind: 'ok', targetHash: 'aaaa1111' });

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} alpha\n`);
      expect(stdout).not.toContain(FIX);
    });

    it('leaves an unverified kit its bare line, having reached no failing verdict', async () => {
      arrangeSingleKit();
      fakes.checkDrift.mockReturnValue({ kind: 'unverified' });

      const { exitCode, stdout } = await verify([], fakes);

      expect(exitCode).toBe(0);
      expect(stdout).not.toContain(FIX);
    });

    it('keeps every remedy out of the JSON payload', async () => {
      arrangeSingleKit();
      fakes.checkDrift.mockReturnValue({
        kind: 'drift',
        expected: 'aaaa1111',
        actual: 'aaaa9999',
        resolvedPath: '/abs/alpha.js',
      });

      const { stdout } = await verify(['--json'], fakes);

      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        passed: false,
        kits: [
          {
            name: 'alpha',
            status: 'drift',
            expected: 'aaaa1111',
            actual: 'aaaa9999',
            sourceStatus: 'unverified',
            inputsStatus: 'unverified',
          },
        ],
      });
    });
  });

  it('reports a config error naming `rdy compile` when the manifest is missing', async () => {
    fakes.readManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/path/to/manifest.json');
    });

    const { error } = await verifyRaising([], fakes);

    expect(error.code).toBe('config');
    expect(error.message).toBe('Manifest file not found: /path/to/manifest.json');
    expect(error.hint).toBe('Run `rdy compile` to create it.');
  });

  it('repeats the --manifest value in the hint for a missing manifest', async () => {
    fakes.readManifest.mockImplementation(() => {
      throw new ManifestNotFoundError('/path/to/custom/manifest.json');
    });

    const { error } = await verifyRaising(['--manifest', 'custom/manifest.json'], fakes);

    expect(error.hint).toBe('Run `rdy compile --manifest custom/manifest.json` to create it.');
  });

  it('reports an invalid manifest without a hint', async () => {
    fakes.readManifest.mockImplementation(() => {
      throw configError('Manifest file contains invalid JSON: /path/to/manifest.json');
    });

    const { error } = await verifyRaising([], fakes);

    expect(error.code).toBe('config');
    expect(error.hint).toBeUndefined();
  });

  it('honors --manifest flag to resolve a custom path', async () => {
    fakes.readManifest.mockReturnValue({ version: 1, kits: [] });

    await verify(['--manifest', 'custom/manifest.json'], fakes);

    expect(fakes.readManifest).toHaveBeenCalledWith(expect.stringContaining('custom/manifest.json'));
  });

  it('reports a usage error when positional arguments are supplied', async () => {
    const { error } = await verifyRaising(['unexpected'], fakes);

    expect(error.code).toBe('usage');
    expect(error.message).toContain('does not accept positional arguments');
  });
});
