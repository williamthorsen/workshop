import {
  JiraRefusalError,
  type JiraRequest,
  JiraRequestError,
  JiraResponseError,
  JiraSettingError,
  JiraTokenCommandError,
  JiraTransportError,
  ProjectSpecError,
  type TokenTransportOptions,
} from '@williamthorsen/toolbelt.atlassian/candidate';
import { UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import {
  SecretPromptError,
  type SecretStore,
  SecretStoreError,
  UnstorableSecretError,
  type WritableSecretStore,
} from '@williamthorsen/toolbelt.secrets/candidate';

export const EXIT_OK = 0;
export const EXIT_NO_RESULT = 1;
export const EXIT_KEYSTORE = 3;
export const EXIT_REQUEST = 4;
export const EXIT_MISMATCH = 5;
export const EXIT_TRANSPORT = 6;

/** The effects deferred to the entry point, which keeps every subcommand free of I/O. */
export interface RunEffects {
  /** Builds the transport through which every Jira call is issued. */
  readonly createRequest: (options: TokenTransportOptions) => JiraRequest;
  readonly createStore: () => WritableSecretStore;
  readonly cwd: () => string;
  readonly env: Record<string, string | undefined>;
  readonly fetch: typeof globalThis.fetch;
  /** Finds the consuming repo's project spec by ascending from a directory, returning `undefined` if none is found. */
  readonly findSpecPath: (fromDir: string) => string | undefined;
  readonly isStdinTty: () => boolean;
  /** Reads a token from the terminal, echoing nothing and asking twice. */
  readonly promptSecret: () => Promise<string>;
  readonly readStdin: () => Promise<string>;
  readonly readTextFile: (filePath: string) => string;
  readonly resolveVersion: () => string;
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
}

/**
 * Wraps the keychain so that it is opened on first use rather than on construction. A run authenticated from
 * the environment then never opens the keychain, and a platform without one is reported only when a caller
 * actually reads from it.
 *
 * @internal
 */
export function createDeferredStore(effects: RunEffects): SecretStore {
  let opened: WritableSecretStore | undefined;

  /** Opens the keychain on the first call and returns that store on every later one. */
  function open(): WritableSecretStore {
    return (opened ??= effects.createStore());
  }

  return {
    deleteSecret: (query) => open().deleteSecret(query),
    findSecret: (query) => open().findSecret(query),
    hasSecret: (query) => open().hasSecret(query),
  };
}

/**
 * Extracts the message contained in an unknown thrown value, appending each cause beneath it. Node's `fetch`
 * reports every transport failure as `fetch failed` and names the host and the fault on `cause` alone, so the
 * chain makes such a failure diagnosable. A message already quoted by a wrapper is not repeated.
 *
 * @internal
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const messages: string[] = [];
  const seen = new Set<Error>();

  for (let current: unknown = error; current instanceof Error && !seen.has(current); current = current.cause) {
    seen.add(current);
    const { message } = current;
    if (message !== '' && messages.every((carried) => !carried.includes(message))) messages.push(message);
  }

  return messages.join(': ');
}

/**
 * Runs a command's body, writing each anticipated failure that has an exit code of its own to `stderr` and returning
 * that code, and reporting a setting, spec, refusal, or prompt failure as a usage error, which exits 2 with a pointer
 * to help. Any other error propagates.
 *
 * @internal
 */
export async function reportFailures(stderr: Writer, body: () => number | Promise<number>): Promise<number> {
  try {
    return await body();
  } catch (error) {
    if (isUsageFailure(error)) throw new UsageError(describeError(error), { cause: error });

    const failure = describeFailure(error);
    if (failure === undefined) throw error;

    stderr.write(`${failure.message}\n`);
    return failure.exitCode;
  }
}

/**
 * Drops the newline that a shell adds to a piped value, leaving one written without a terminator untouched.
 *
 * @internal
 */
export function stripOneTrailingNewline(input: string): string {
  return input.replace(/\r?\n$/, '');
}

/**
 * Reports a printed result, terminating the line written by the caller.
 *
 * @internal
 */
export function succeed(effects: RunEffects, output: string): number {
  effects.write(`${output}\n`);

  return EXIT_OK;
}

// region | Helpers

/** Returns the exit code and message of an anticipated failure that is not a usage error, or `undefined` otherwise. */
function describeFailure(error: unknown): { exitCode: number; message: string } | undefined {
  if (error instanceof SecretStoreError) return { exitCode: EXIT_KEYSTORE, message: describeError(error) };
  if (error instanceof JiraRequestError || error instanceof JiraResponseError) {
    return { exitCode: EXIT_REQUEST, message: error.message };
  }
  // A run that never reached Jira is retryable, and no help text can fix a network.
  if (error instanceof JiraTransportError) return { exitCode: EXIT_TRANSPORT, message: describeError(error) };

  return undefined;
}

/** Reports whether an error is an anticipated failure that the user fixes by changing the input or the settings. */
function isUsageFailure(error: unknown): boolean {
  return (
    error instanceof JiraRefusalError ||
    error instanceof JiraSettingError ||
    error instanceof JiraTokenCommandError ||
    error instanceof ProjectSpecError ||
    error instanceof SecretPromptError ||
    error instanceof UnstorableSecretError
  );
}

// endregion | Helpers
