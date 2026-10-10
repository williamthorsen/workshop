import { createCli, runCli, UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';
import { deriveBranchNumber, findBranchTicketRef } from '@williamthorsen/toolbelt.git/candidate';

const EXIT_NO_RESULT = 1;

const { defineCommand, defineGroup } = createCli<RunEffects>();

const BRANCH_OPERAND = {
  name: 'branch',
  description: 'The branch name; the checked-out branch when omitted',
  optional: true,
} as const;

const KEY_FLAG = {
  type: 'string',
  description: "The project's ticket key, matched in any casing",
  valueHint: 'key',
} as const;

const ROOT = defineGroup({
  summary: 'Utilities for working with git branch names.',
  epilog: `Exit codes:
  0  A result was printed
  1  ticket-ref found no ticket in the branch name
  2  Usage or validation error`,
  commands: {
    'branch-number': defineCommand({
      summary: 'Print a stable number derived from a branch name',
      description:
        'Print the number of the ticket encoded by the branch name, or a hash of the name when it encodes none.',
      epilog: 'Write a negative offset in the = form: --offset=-3.',
      flags: {
        key: KEY_FLAG,
        max: {
          type: 'string',
          description: 'Upper bound, inclusive (default 4294967295)',
          valueHint: 'n',
          parse: parseNumber,
        },
        min: { type: 'string', description: 'Lower bound, inclusive (default 0)', valueHint: 'n', parse: parseNumber },
        offset: {
          type: 'string',
          description: 'Rotate the result within the bounds',
          valueHint: 'n',
          parse: parseNumber,
        },
      },
      operands: [BRANCH_OPERAND],
      run: ({ context, flags, operands, stdout }) =>
        reportFailures(() => {
          const number = deriveBranchNumber(selectBranch(operands.branch, context), {
            key: flags.key,
            max: flags.max,
            min: flags.min,
            offset: flags.offset,
          });
          stdout.write(`${number}\n`);
        }),
    }),
    'ticket-ref': defineCommand({
      summary: 'Print the ID of the ticket encoded by a branch name',
      description: 'Print the ID of the ticket encoded by the branch name, exiting 1 when it encodes none.',
      flags: {
        json: { type: 'boolean', description: 'Print the whole ref on one line as JSON' },
        key: KEY_FLAG,
      },
      operands: [BRANCH_OPERAND],
      run: ({ context, flags, operands, stdout }) =>
        reportFailures(() => {
          const ref = findBranchTicketRef(selectBranch(operands.branch, context), { key: flags.key });
          if (ref === undefined) return EXIT_NO_RESULT;

          stdout.write(`${flags.json ? JSON.stringify(ref) : ref.id}\n`);
          return;
        }),
    }),
  },
});

/**
 * Runs the `thor-git` command line, returning what to write and exit with rather than doing either, so that the whole
 * surface is exercisable without a process. An empty argv prints the help. Every failure is reported through the
 * result: Nothing throws.
 */
export async function run(args: readonly string[], effects: RunEffects): Promise<RunResult> {
  const stdout = createTextBuffer();
  const stderr = createTextBuffer();
  const exitCode = await runCli(args.length === 0 ? ['--help'] : args, ROOT, {
    name: 'thor-git',
    context: effects,
    version: () => resolveVersion(effects),
    stdout,
    stderr,
  });

  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

/** The effects deferred to the entry point, which keeps the runner free of I/O. */
export interface RunEffects {
  readonly resolveBranch: () => string;
  readonly resolveVersion: () => string;
}

/** What the caller should write to each stream and exit with. */
export interface RunResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

// region | Helpers

/** Returns a writer that accumulates what is written to it. */
function createTextBuffer(): Writer & { readonly text: string } {
  let text = '';

  return {
    get text() {
      return text;
    },
    write(chunk: string) {
      text += chunk;
    },
  };
}

/**
 * Converts a flag's text to a number, leaving validation of a present value to the library that receives it. A blank
 * value is rejected here instead, since `Number(' ')` is `0`.
 */
function parseNumber(value: string): number {
  if (value.trim() === '') throw new Error('The value is blank.');

  return Number(value);
}

/** Runs a command's body, reporting anything that it throws as a usage error, which exits 2 with a pointer to help. */
async function reportFailures(
  body: () => number | undefined | Promise<number | undefined>,
): Promise<number | undefined> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof UsageError) throw error;

    throw new UsageError(describeError(error), { cause: error });
  }
}

/** Resolves the installed version, reporting a failure as a usage error, which exits 2. */
function resolveVersion(effects: RunEffects): string {
  try {
    return effects.resolveVersion();
  } catch (error) {
    throw new UsageError(describeError(error), { cause: error });
  }
}

/**
 * Chooses the branch to derive from: the operand, or the checked-out branch when none is given. An empty operand is
 * rejected rather than treated as absent, so a caller's own failed resolution of the branch name is reported here
 * instead of being silently replaced.
 */
function selectBranch(branch: string | undefined, effects: RunEffects): string {
  if (branch === undefined) return effects.resolveBranch();
  if (branch === '') throw new Error('The branch name is empty. Omit it to use the checked-out branch.');

  return branch;
}

// endregion | Helpers
