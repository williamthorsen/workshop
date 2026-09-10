import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';

import { routeCommand } from '../route.ts';

export interface RouteCliOptions {
  /** Captures `console` alongside the streams, for a command reporting through it rather than writing directly. */
  includeConsole?: boolean;
  /** Reports a terminal to style detection. Absent by default, which resolves the style to plain wherever the suite runs. */
  isTty?: boolean;
}

export interface RouteCliResult {
  exitCode: number;
  stderr: string;
  stderrChunks: readonly string[];
  stdout: string;
}

/**
 * Routes a CLI invocation, returning its exit code alongside everything it wrote.
 *
 * The terminal defaults to absent, so a test asserting rich output names `--style rich` rather than inheriting
 * a style from the environment that the suite happens to run in.
 */
export async function routeCli(args: string[], options: RouteCliOptions = {}): Promise<RouteCliResult> {
  const { includeConsole = false, isTty = false } = options;

  using io = captureStdio({ includeConsole, isTty });

  const exitCode = await routeCommand(args);

  return { exitCode, stderr: io.stderr, stderrChunks: io.stderrChunks, stdout: io.stdout };
}
