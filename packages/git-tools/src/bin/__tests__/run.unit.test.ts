import { describe, expect, it } from 'vitest';

import { run, type RunEffects } from '../run.ts';

const CHECKED_OUT = '249_add-thor-git-cli';
const KEYED = 'author/MAC-22.1-add-widget';
const TICKETLESS = 'main';
const VERSION = '9.9.9';

const EFFECTS: RunEffects = {
  resolveBranch: () => CHECKED_OUT,
  resolveVersion: () => VERSION,
};

describe(run, () => {
  describe('branch-number', () => {
    it('prints the number encoded by the branch', async () => {
      await expect(run(['branch-number', '249_add-thor-git-cli'], EFFECTS)).resolves.toStrictEqual({
        exitCode: 0,
        stderr: '',
        stdout: '249\n',
      });
    });

    it('bounds the number with --min and --max', async () => {
      await expect(runSucceeding(['branch-number', '1232', '--min', '3000', '--max', '3999'])).resolves.toBe('3232\n');
    });

    it('rotates the number with --offset, which takes a negative value in the = form', async () => {
      await expect(runSucceeding(['branch-number', '249', '--max', '999', '--offset', '5'])).resolves.toBe('254\n');
      await expect(runSucceeding(['branch-number', '249', '--max', '999', '--offset=-5'])).resolves.toBe('244\n');
    });

    it('honours --key', async () => {
      await expect(runSucceeding(['branch-number', 'mac-22/add-widget', '--key', 'mac'])).resolves.toBe('22\n');
    });

    it('derives from the checked-out branch when no branch is given', async () => {
      await expect(runSucceeding(['branch-number'])).resolves.toBe('249\n');
    });
  });

  describe('ticket-ref', () => {
    it('prints the ref id', async () => {
      await expect(runSucceeding(['ticket-ref', KEYED])).resolves.toBe('MAC-22\n');
    });

    it('prints the whole ref on one line under --json', async () => {
      await expect(runSucceeding(['ticket-ref', KEYED, '--json'])).resolves.toBe(
        '{"id":"MAC-22","key":"MAC","number":22,"revisit":1}\n',
      );
    });

    it('honours --key', async () => {
      await expect(runSucceeding(['ticket-ref', 'mac-22/add-widget', '--key', 'mac'])).resolves.toBe('MAC-22\n');
    });

    it('derives from the checked-out branch when no branch is given', async () => {
      await expect(runSucceeding(['ticket-ref'])).resolves.toBe('249\n');
    });

    it.each([
      ['ticket-ref', TICKETLESS],
      ['ticket-ref', TICKETLESS, '--json'],
    ])('exits 1 with both streams empty when the branch encodes no ticket: %o', async (...args) => {
      await expect(run(args, EFFECTS)).resolves.toStrictEqual({ exitCode: 1, stderr: '', stdout: '' });
    });
  });

  describe('help and version', () => {
    it.each([['--help'], ['-h']])('prints the root help on %o', async (flag) => {
      const { exitCode, stdout } = await run([flag], EFFECTS);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: thor-git [options] <command>');
      expect(stdout).toContain('Exit codes:');
      expect(stdout).toContain('branch-number');
      expect(stdout).toContain('ticket-ref');
    });

    it('prints the root help when given no arguments', async () => {
      const bare = await run([], EFFECTS);

      expect(bare).toStrictEqual(await run(['--help'], EFFECTS));
      expect(bare.exitCode).toBe(0);
    });

    it.each(['branch-number', 'ticket-ref'])('prints the help of %o', async (subcommand) => {
      const { exitCode, stdout } = await run([subcommand, '--help'], EFFECTS);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`Usage: thor-git ${subcommand}`);
      expect(stdout).toContain('--key');
    });

    it('reports a failure to resolve the version as a usage error', async () => {
      const failing: RunEffects = {
        ...EFFECTS,
        resolveVersion: () => {
          throw new Error('The manifest declares no version.');
        },
      };

      await expect(run(['--version'], failing)).resolves.toStrictEqual({
        exitCode: 2,
        stderr: "Error: The manifest declares no version.\nTry 'thor-git --help'.\n",
        stdout: '',
      });
    });

    it.each([['--version'], ['-V']])('prints the resolved version on %o', async (flag) => {
      await expect(runSucceeding([flag])).resolves.toBe(`${VERSION}\n`);
    });
  });

  describe('given a bad invocation', () => {
    it.each([
      { args: ['branch'], expected: 'Error: Unknown command: branch' },
      { args: ['--bogus'], expected: 'Error: Unknown option: --bogus' },
      { args: ['branch-number', '--bogus'], expected: 'Error: Unknown option: --bogus' },
      { args: ['branch-number', ''], expected: 'The branch name is empty.' },
      { args: ['ticket-ref', 'a', 'b'], expected: 'Unexpected positional argument: b' },
      { args: ['branch-number', '249', '--offset', '-3'], expected: 'Missing value for option: --offset' },
      { args: ['branch-number', '249', '--min', 'abc'], expected: 'Received min=NaN' },
      { args: ['branch-number', '249', '--min', ''], expected: 'Missing value for option: --min' },
      { args: ['branch-number', '249', '--max', ' '], expected: 'Invalid value for --max:  . The value is blank.' },
      { args: ['branch-number', '249', '--offset', ''], expected: 'Missing value for option: --offset' },
      { args: ['ticket-ref', '249', '--key', 'a'], expected: 'Invalid key' },
    ])('exits 2 with the message on stderr: $args', async ({ args, expected }) => {
      const { exitCode, stderr, stdout } = await run(args, EFFECTS);

      expect(exitCode).toBe(2);
      expect(stdout).toBe('');
      expect(stderr).toContain(expected);
    });

    it('reports a failure to resolve the checked-out branch', async () => {
      const failing: RunEffects = {
        resolveBranch: () => {
          throw new Error('HEAD names no branch.');
        },
        resolveVersion: () => VERSION,
      };
      const { exitCode, stderr, stdout } = await run(['branch-number'], failing);

      expect(exitCode).toBe(2);
      expect(stdout).toBe('');
      expect(stderr).toContain('HEAD names no branch.');
    });

    it('points at the subcommand help when a subcommand was named', async () => {
      expect((await run(['branch-number', ''], EFFECTS)).stderr).toContain("Try 'thor-git branch-number --help'.");
      expect((await run(['--bogus'], EFFECTS)).stderr).toContain("Try 'thor-git --help'.");
    });

    it('suggests the closest command for a near miss', async () => {
      expect((await run(['ticket-rf'], EFFECTS)).stderr).toContain("Did you mean 'ticket-ref'?");
    });
  });
});

// region | Helpers

/** Runs the CLI, asserting it succeeded, and returns what it would write to stdout. */
async function runSucceeding(args: string[]): Promise<string> {
  const { exitCode, stderr, stdout } = await run(args, EFFECTS);

  expect({ exitCode, stderr }).toStrictEqual({ exitCode: 0, stderr: '' });

  return stdout;
}

// endregion | Helpers
