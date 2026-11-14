import path from 'node:path';
import process from 'node:process';

import { type ChezmoiContext, chezmoiRunner } from './chezmoi/run-chezmoi.ts';
import { assertChezmoiVersion } from './chezmoi/version.ts';
import { runCreate } from './modes/create.ts';
import { runForce } from './modes/force.ts';
import type { OverlayMode, OverlayResult } from './modes/types.ts';
import { runVerify } from './modes/verify.ts';

/** Options for an overlay run. */
export interface OverlayOptions {
  source: string;
  target?: string;
  mode?: OverlayMode;
  /** Receives chezmoi's apply output and `run_` script output (default `process.stderr`). Overlay never ends it. */
  output?: NodeJS.WritableStream;
}

/**
 * Converges a target directory toward a chezmoi source tree.
 *
 * Resolves defaults (`target = process.cwd()`, `mode = 'verify'`, `output = process.stderr`), preflights the chezmoi
 * version, then dispatches to the mode strategy. A failed preflight (chezmoi missing or below the minimum version)
 * throws; the CLI maps that to exit `2`.
 */
export async function overlay(options: OverlayOptions): Promise<OverlayResult> {
  const mode: OverlayMode = options.mode ?? 'verify';
  const context: ChezmoiContext = {
    source: path.resolve(options.source),
    target: path.resolve(options.target ?? process.cwd()),
    output: options.output ?? process.stderr,
    runner: chezmoiRunner,
  };

  await assertChezmoiVersion(context);

  if (mode === 'create') return runCreate(context);
  if (mode === 'force') return runForce(context);
  return runVerify(context);
}
