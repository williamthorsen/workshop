import { describe, expect, it } from 'vitest';

import { run, type RunEffects } from '../run.ts';
import { createTextBuffer } from '../test-utils/createTextBuffer.ts';

const VERSION = '9.9.9';

const EFFECTS: RunEffects = {
  createTempDir: () => {
    throw new Error('Unexpected createTempDir call');
  },
  isStdinTty: () => true,
  isStdoutTty: () => true,
  npm: {
    addGithubTrust: () => ({ kind: 'failed', detail: 'unexpected addGithubTrust' }),
    findVersion: () => ({ kind: 'found' }),
    listTrust: () => ({ kind: 'failed', detail: 'unexpected listTrust' }),
    publish: () => ({ kind: 'failed', detail: 'unexpected publish' }),
    revokeTrust: () => ({ kind: 'failed', detail: 'unexpected revokeTrust' }),
    whoami: () => ({ kind: 'logged-in', username: 'someone' }),
  },
  readAnswer: () => Promise.resolve(undefined),
  resolveVersion: () => VERSION,
};

describe(run, () => {
  describe('help and version', () => {
    it.each([['--help'], ['-h']])('prints the root help on %o', async (flag) => {
      const { exitCode, stderr, stdout } = await runWithBuffers([flag]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toContain('Usage: thor-npm [options] <command>');
      expect(stdout).toContain('move-trust');
      expect(stdout).toContain('publish-placeholder');
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

    it('reports a failure to resolve the version as a usage error', async () => {
      const failing: RunEffects = {
        ...EFFECTS,
        resolveVersion: () => {
          throw new Error('The manifest declares no version.');
        },
      };

      await expect(runWithBuffers(['--version'], failing)).resolves.toStrictEqual({
        exitCode: 2,
        stderr: "thor-npm: The manifest declares no version.\nTry 'thor-npm --help'.\n",
        stdout: '',
      });
    });
  });

  describe('move-trust', () => {
    const listing: RunEffects = {
      ...EFFECTS,
      npm: {
        ...EFFECTS.npm,
        listTrust: () => ({
          kind: 'listed',
          entries: [{ file: 'release.yaml', id: 'trust-1', permissions: ['createPackage'], repository: 'owner/old' }],
          otherCount: 0,
        }),
      },
    };

    it('prints its own help, even without the operand', async () => {
      const { exitCode, stdout } = await runWithBuffers(['move-trust', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: thor-npm move-trust');
      for (const flag of ['--dry-run', '--file', '--force', '--from', '--to']) expect(stdout).toContain(flag);
      expect(stdout).toContain(
        'thor-npm move-trust @scope/package --from owner/old-repo --to owner/new-repo --dry-run',
      );
    });

    it('exits 2 without the operand', async () => {
      const { exitCode, stderr } = await runWithBuffers(['move-trust', '--from', 'owner/old', '--to', 'owner/new']);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Try 'thor-npm move-trust --help'.");
    });

    it.each([
      { args: ['--to', 'owner/new'], expected: 'thor-npm: --from <owner/repo> is required' },
      { args: ['--from', 'owner/old'], expected: 'thor-npm: --to <owner/repo> is required' },
    ])('exits 2 when a repository flag is absent: $args', async ({ args, expected }) => {
      const { exitCode, stderr } = await runWithBuffers(['move-trust', '@scope/pkg', ...args], listing);

      expect(exitCode).toBe(2);
      expect(stderr).toContain(expected);
      expect(stderr).toContain("Try 'thor-npm move-trust --help'.");
    });

    it('passes the operand, the repository flags, --file, and the short flags to the command', async () => {
      const { exitCode, stderr } = await runWithBuffers(
        ['move-trust', '@scope/pkg', '--from', 'owner/old', '--to', 'owner/new', '--file', 'publish.yml', '-n', '-f'],
        listing,
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain('  To: owner/new\n');
      expect(stderr).toContain('  Workflow: release.yaml → publish.yml\n');
      expect(stderr).toContain('thor-npm move-trust: nothing was changed (dry run)\n');
    });
  });

  describe('publish-placeholder', () => {
    it('prints its own help, even without the operand', async () => {
      const { exitCode, stdout } = await runWithBuffers(['publish-placeholder', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: thor-npm publish-placeholder');
      expect(stdout).toContain('--dry-run');
      expect(stdout).toContain('--force');
      expect(stdout).toContain('thor-npm publish-placeholder @scope/new-package --dry-run');
    });

    it('exits 2 without the operand', async () => {
      const { exitCode, stderr } = await runWithBuffers(['publish-placeholder']);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Try 'thor-npm publish-placeholder --help'.");
    });

    it('passes the operand and the short flags to the command', async () => {
      const { exitCode, stderr } = await runWithBuffers(['publish-placeholder', '@scope/taken', '-n', '-f']);

      expect(exitCode).toBe(1);
      expect(stderr).toBe(
        "thor-npm publish-placeholder: '@scope/taken' already exists on the registry; a placeholder is only for a new name\n",
      );
    });

    it('reports a usage error from the command with a pointer to its help', async () => {
      const { exitCode, stderr } = await runWithBuffers(['publish-placeholder', 'Not Valid']);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("thor-npm: invalid package name 'Not Valid':");
      expect(stderr).toContain("Try 'thor-npm publish-placeholder --help'.");
    });

    it('reports an unexpected error on stderr with exit 1', async () => {
      const throwing: RunEffects = {
        ...EFFECTS,
        npm: {
          ...EFFECTS.npm,
          findVersion: () => {
            throw new Error('boom');
          },
        },
      };

      await expect(runWithBuffers(['publish-placeholder', 'free-name'], throwing)).resolves.toStrictEqual({
        exitCode: 1,
        stderr: 'thor-npm: boom\n',
        stdout: '',
      });
    });
  });

  describe('given a bad invocation', () => {
    it.each([
      { args: ['publish'], expected: 'thor-npm: Unknown command: publish' },
      { args: ['--bogus'], expected: 'thor-npm: Unknown option: --bogus' },
    ])('exits 2, pointing at the help: $args', async ({ args, expected }) => {
      const { exitCode, stderr, stdout } = await runWithBuffers(args);

      expect(exitCode).toBe(2);
      expect(stdout).toBe('');
      expect(stderr).toContain(expected);
      expect(stderr).toContain("Try 'thor-npm --help'.");
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
