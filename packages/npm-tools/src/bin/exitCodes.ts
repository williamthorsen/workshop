// Exit 2, for a usage error, belongs to `runCli`, which sets it for every `UsageError`.
export const EXIT_FAILED = 1;
export const EXIT_NPM_MISSING = 127;
export const EXIT_OK = 0;

/** The text that a command writes to each stream, and the exit code with which it ends. */
export interface RenderedOutput {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}
