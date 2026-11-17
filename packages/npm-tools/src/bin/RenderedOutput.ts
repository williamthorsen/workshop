/** The text that a command writes to each stream, and the exit code with which it ends. */
export interface RenderedOutput {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}
