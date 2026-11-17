import {
  JiraRefusalError,
  JiraRequestError,
  JiraResponseError,
  JiraSettingError,
  JiraTokenCommandError,
  JiraTransportError,
  ProjectSpecError,
} from '@williamthorsen/toolbelt.atlassian/candidate';
import { UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import { SecretPromptError, SecretStoreError, UnstorableSecretError } from '@williamthorsen/toolbelt.secrets/candidate';

const EXIT_KEYSTORE = 3;
const EXIT_REQUEST = 4;
const EXIT_TRANSPORT = 6;

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

export const EXIT_MISMATCH = 5;
export const EXIT_NO_RESULT = 1;
export const EXIT_OK = 0;

/** The invocation name, which prefixes every message that the CLI writes to stderr. */
export const PROGRAM_NAME = 'thor-jira';

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

    stderr.write(`${PROGRAM_NAME}: ${failure.message}\n`);
    return failure.exitCode;
  }
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
