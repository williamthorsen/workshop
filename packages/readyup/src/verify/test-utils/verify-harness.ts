import { captureError, captureStdio } from '@williamthorsen/toolbelt.testing/candidate';

import { DEFAULT_CONFIG } from '../../config/loadConfig.ts';
import { RdyError } from '../../errors/RdyError.ts';
import type { ResolvedRdyConfig } from '../../kits/types.ts';
import { verifyCommand } from '../verifyCommand.ts';

/** A verify run's exit code alongside everything that it wrote. */
export interface VerifyRun {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** A raising verify run's error alongside everything that it wrote. */
export interface VerifyRaisingRun {
  error: RdyError;
  stderr: string;
  stdout: string;
}

/** Returns the default config with its compile selection pointed at `srcDir` and adjusted by `overrides`. */
export function buildConfig(srcDir: string, overrides: Partial<ResolvedRdyConfig['compile']> = {}): ResolvedRdyConfig {
  return { ...DEFAULT_CONFIG, compile: { ...DEFAULT_CONFIG.compile, srcDir, ...overrides } };
}

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
export async function verify(args: string[]): Promise<VerifyRun> {
  using io = captureStdio();

  const exitCode = await verifyCommand(args);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

/** Runs the command expecting it to raise, returning the error alongside everything it wrote. */
export async function verifyRaising(args: string[]): Promise<VerifyRaisingRun> {
  using io = captureStdio();

  const error = await captureError(RdyError, () => verifyCommand(args));

  return { error, stdout: io.stdout, stderr: io.stderr };
}
