import path from 'node:path';
import process from 'node:process';

import type { ChezmoiContext } from './chezmoi/runChezmoi.ts';
import { assertChezmoiVersion } from './chezmoi/version.ts';
import { runCreate } from './modes/create.ts';
import { runForce } from './modes/force.ts';
import { runVerify } from './modes/verify.ts';
import type { OverlayMode, OverlayOptions, OverlayResult } from './types.ts';

/**
 * Converge a target directory toward a chezmoi source tree.
 *
 * Resolves defaults (`target = process.cwd()`, `mode = 'verify'`), preflights
 * the chezmoi version, then dispatches to the mode strategy. A failed preflight
 * (chezmoi missing or below the minimum version) throws; the CLI maps that to
 * exit `2`.
 */
export async function overlay(options: OverlayOptions): Promise<OverlayResult> {
  const mode: OverlayMode = options.mode ?? 'verify';
  const context: ChezmoiContext = {
    source: path.resolve(options.source),
    target: path.resolve(options.target ?? process.cwd()),
  };

  await assertChezmoiVersion(context);

  if (mode === 'create') return runCreate(context);
  if (mode === 'force') return runForce(context);
  return runVerify(context);
}
