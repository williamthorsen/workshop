import { createCli, createTextBuffer, runCli, UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';
import {
  SecretPromptError,
  type SecretQuery,
  SecretStoreError,
  UnstorableSecretError,
  type WritableSecretStore,
} from '@williamthorsen/toolbelt.secrets/candidate';

/** The invocation name, which prefixes every message that the CLI writes to stderr. */
export const PROGRAM_NAME = 'thor-secret';

const EXIT_OK = 0;
const EXIT_NO_RESULT = 1;
const EXIT_KEYSTORE = 3;

const { defineCommand, defineGroup } = createCli<RunEffects>();

const SERVICE_OPERAND = { name: 'service', description: 'The service that names the secret' } as const;

const SECRET_FLAGS = {
  account: {
    type: 'string',
    description: 'Account holding the secret (default: the empty account)',
    short: 'a',
    valueHint: 'name',
  },
  keychain: {
    type: 'string',
    description: 'Keychain to act on, rather than the default search list',
    short: 'k',
    valueHint: 'path',
  },
} as const;

const ROOT = defineGroup({
  summary: 'Store and read secrets in the macOS keychain. Requires macOS.',
  epilog: `A secret is named by a service and an optional account, so one service can hold a secret per account. An item
is local to this Mac: \`security\` offers no iCloud Keychain synchronization.

Exit codes:
  0  The command succeeded
  1  No secret is stored under that service and account, or thor-secret hit an internal error
  2  Usage or validation error
  3  The keychain could not be reached`,
  commands: {
    delete: defineCommand({
      summary: 'Remove a secret',
      description: 'Remove a secret, exiting 1 when none is stored.',
      flags: SECRET_FLAGS,
      operands: [SERVICE_OPERAND],
      run: ({ context, flags, operands, stderr }) =>
        reportFailures(stderr, () => {
          const query = buildQuery(operands.service, flags.account);
          const removed = context.createStore(flags.keychain).deleteSecret(query);

          return removed ? EXIT_OK : EXIT_NO_RESULT;
        }),
    }),
    get: defineCommand({
      summary: 'Print a secret',
      description: 'Print a secret, exiting 1 when none is stored.',
      flags: SECRET_FLAGS,
      operands: [SERVICE_OPERAND],
      run: ({ context, flags, operands, stderr, stdout }) =>
        reportFailures(stderr, () => {
          const query = buildQuery(operands.service, flags.account);
          const secret = context.createStore(flags.keychain).findSecret(query);
          if (secret === undefined) return EXIT_NO_RESULT;

          stdout.write(`${secret}\n`);
          return EXIT_OK;
        }),
    }),
    has: defineCommand({
      summary: 'Report whether a secret is stored, printing nothing',
      description: `Exit 0 when a secret is stored and 1 when none is, printing nothing either way. The secret itself is never
read, so this raises no keychain access prompt.`,
      flags: SECRET_FLAGS,
      operands: [SERVICE_OPERAND],
      run: ({ context, flags, operands, stderr }) =>
        reportFailures(stderr, () => {
          const query = buildQuery(operands.service, flags.account);
          const stored = context.createStore(flags.keychain).hasSecret(query);

          return stored ? EXIT_OK : EXIT_NO_RESULT;
        }),
    }),
    set: defineCommand({
      summary: 'Store a secret',
      description: 'Store a secret, replacing one already stored under the same service and account.',
      epilog: `At a terminal the secret is prompted for twice and echoed nowhere; piped, it is read from stdin and one
trailing newline is dropped, since \`echo\` adds one. Either way it is passed to \`security\` inside a command
sent on stdin, so it never enters an argument vector that any local process could read.

The stored secret is read back and compared before this command reports success. Replacing an item that
another program created can therefore raise a keychain access prompt, since verifying the write reads the
secret.

A secret can be about 2,000 bytes long. The exact ceiling depends on the service, account, and keychain, which
share one 4,095-byte command line with it; a secret that would not fit is refused rather than stored in part.`,
      flags: SECRET_FLAGS,
      operands: [SERVICE_OPERAND],
      run: ({ context, flags, operands, stderr }) =>
        reportFailures(stderr, () => runSet(operands.service, flags, context)),
    }),
  },
});

/**
 * Runs the `thor-secret` command line, returning what to write and exit with rather than doing either, so that
 * the whole surface is exercisable without a process. A usage error, which includes an empty service name, an
 * abandoned prompt, and a secret that the keychain cannot store, is reported through the result with exit 2, and a
 * keychain that cannot be reached with exit 3; any other error propagates to the caller.
 */
export async function run(args: readonly string[], effects: RunEffects): Promise<RunResult> {
  const stdout = createTextBuffer();
  const stderr = createTextBuffer();
  const exitCode = await runCli(args, ROOT, {
    name: PROGRAM_NAME,
    context: effects,
    version: () => effects.resolveVersion(),
    stdout,
    stderr,
  });

  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

/** The effects deferred to the entry point, which keeps the runner free of I/O. */
export interface RunEffects {
  readonly createStore: (keychain: string | undefined) => WritableSecretStore;
  readonly isStdinTty: () => boolean;
  /** Reads a secret from the terminal, echoing nothing and asking twice. */
  readonly promptSecret: () => Promise<string>;
  readonly readStdin: () => Promise<string>;
  readonly resolveVersion: () => string;
}

/** What the caller should write to each stream and exit with. */
export interface RunResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

// region | Helpers

/** Names the item on which a command acts. An empty service is refused rather than passed to the keychain. */
function buildQuery(service: string, account: string | undefined): SecretQuery {
  if (service === '') throw new UsageError('The service name is empty.');

  return { account, service };
}

/**
 * Runs a command's body, writing a keychain failure to stderr with exit 3 and reporting a prompt that produced no
 * secret or a secret that the keychain cannot store as a usage error, which exits 2 with a pointer to help. Any other
 * error propagates.
 */
async function reportFailures(stderr: Writer, body: () => number | Promise<number>): Promise<number> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof SecretStoreError) {
      stderr.write(`${PROGRAM_NAME}: ${describeError(error)}\n`);
      return EXIT_KEYSTORE;
    }
    if (error instanceof SecretPromptError || error instanceof UnstorableSecretError) {
      throw new UsageError(describeError(error), { cause: error });
    }

    throw error;
  }
}

/**
 * Stores the secret that it is given, prompting at a terminal and reading stdin otherwise. The store is opened
 * first, so that a platform that has no keychain is reported before a secret is typed into this process.
 */
async function runSet(
  service: string,
  flags: { account: string | undefined; keychain: string | undefined },
  effects: RunEffects,
): Promise<number> {
  const query = buildQuery(service, flags.account);
  const store = effects.createStore(flags.keychain);
  const secret = effects.isStdinTty()
    ? await effects.promptSecret()
    : stripOneTrailingNewline(await effects.readStdin());

  store.setSecret(query, secret);

  return EXIT_OK;
}

/** Drops the newline that a shell adds to a piped secret, leaving one written without a terminator untouched. */
function stripOneTrailingNewline(input: string): string {
  return input.replace(/\r?\n$/, '');
}

// endregion | Helpers
