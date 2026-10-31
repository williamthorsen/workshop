import { describe, expect, it } from 'vitest';

import { run, type RunEffects } from '../run.ts';

const VERSION = '9.9.9';

const EFFECTS: RunEffects = {
  resolveVersion: () => VERSION,
};

describe(run, () => {
  describe('help and version', () => {
    it.each([['--help'], ['-h']])('prints the root help on %o', async (flag) => {
      const { exitCode, stderr, stdout } = await run([flag], EFFECTS);

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toContain('Usage: thor-demo [options] <command>');
      expect(stdout).toContain('Exit codes:');
    });

    it('prints the root help when given no arguments', async () => {
      const bare = await run([], EFFECTS);

      expect(bare).toStrictEqual(await run(['--help'], EFFECTS));
      expect(bare.exitCode).toBe(0);
    });

    it.each([['--version'], ['-V']])('prints the resolved version on %o', async (flag) => {
      await expect(run([flag], EFFECTS)).resolves.toStrictEqual({ exitCode: 0, stderr: '', stdout: `${VERSION}\n` });
    });

    it('reports a failure to resolve the version as a usage error', async () => {
      const failing: RunEffects = {
        resolveVersion: () => {
          throw new Error('The manifest declares no version.');
        },
      };

      await expect(run(['--version'], failing)).resolves.toStrictEqual({
        exitCode: 2,
        stderr: "Error: The manifest declares no version.\nTry 'thor-demo --help'.\n",
        stdout: '',
      });
    });
  });

  describe('given a bad invocation', () => {
    it.each([
      { args: ['render'], expected: 'Error: Unknown command: render' },
      { args: ['--bogus'], expected: 'Error: Unknown option: --bogus' },
    ])('exits 2, pointing at the help: $args', async ({ args, expected }) => {
      const { exitCode, stderr, stdout } = await run(args, EFFECTS);

      expect(exitCode).toBe(2);
      expect(stdout).toBe('');
      expect(stderr).toContain(expected);
      expect(stderr).toContain("Try 'thor-demo --help'.");
    });
  });
});
