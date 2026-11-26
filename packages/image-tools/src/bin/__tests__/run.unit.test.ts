import { createTextBuffer } from '@williamthorsen/toolbelt.cli/candidate';
import { describe, expect, it } from 'vitest';

import { run, type RunEffects } from '../run.ts';
import { buildRunEffects } from '../test-utils/build-run-effects.ts';

const VERSION = '9.9.9';

const EFFECTS: RunEffects = buildRunEffects({ resolveVersion: () => VERSION });

describe(run, () => {
  describe('help and version', () => {
    it.each([['--help'], ['-h']])('prints the root help on %o', async (flag) => {
      const { exitCode, stderr, stdout } = await runWithBuffers([flag]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toContain('thor-image');
      expect(stdout).toContain('Generate images in named styles from open-weight models, and render coded pixel art');
      expect(stdout).toContain('Exit codes:');
    });

    it('prints the root help when given no arguments', async () => {
      const bare = await runWithBuffers([]);

      expect(bare).toStrictEqual(await runWithBuffers(['--help']));
      expect(bare.exitCode).toBe(0);
    });

    it.each([['--version'], ['-V']])('prints the resolved version on %o', async (flag) => {
      await expect(runWithBuffers([flag])).resolves.toStrictEqual({ exitCode: 0, stderr: '', stdout: `${VERSION}\n` });
    });

    it('leaves a failure to resolve the version to the crash handler', async () => {
      const failure = new Error('The manifest declares no version.');
      const failing = buildRunEffects({
        resolveVersion: () => {
          throw failure;
        },
      });

      await expect(runWithBuffers(['--version'], failing)).rejects.toBe(failure);
    });
  });

  describe('given a bad invocation', () => {
    it.each([
      { args: ['render'], expected: 'thor-image: Unknown command: render' },
      { args: ['--bogus'], expected: 'thor-image: Unknown option: --bogus' },
    ])('exits 2, pointing at the help: $args', async ({ args, expected }) => {
      const { exitCode, stderr, stdout } = await runWithBuffers(args);

      expect(exitCode).toBe(2);
      expect(stdout).toBe('');
      expect(stderr).toContain(expected);
      expect(stderr).toContain("Try 'thor-image --help'.");
    });
  });
});

// region | Helpers

/** Runs the command line, collecting what it writes to each stream. */
async function runWithBuffers(
  args: string[],
  effects: RunEffects = EFFECTS,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const stdout = createTextBuffer();
  const stderr = createTextBuffer();
  const exitCode = await run(args, effects, { stderr, stdout });

  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

// endregion | Helpers
