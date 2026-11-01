import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';

import { findPackageRoot } from '@williamthorsen/toolbelt.packaging/candidate';

import type { RunInvocation } from './invocation.ts';

/** The outcome of preparing the recorder: the compiled program, or why it cannot be compiled. */
export type PrepareRecorderResult = { ok: true; recorder: string } | { ok: false; message: string };

/** The Swift source of the recorder, which ships in the package. */
export const RECORDER_SOURCE = path.join(findPackageRoot(import.meta.url), 'native', 'record-audio.swift');

/**
 * Returns the recorder compiled from `RECORDER_SOURCE` under `<home>/bin`, compiling it with `swiftc` when no build
 * of the current source exists. The build's name contains the source's checksum, so a changed source recompiles.
 */
export async function prepareRecorder(
  home: string,
  run: RunInvocation,
  report: (line: string) => void,
): Promise<PrepareRecorderResult> {
  const checksum = createHash('sha256').update(readFileSync(RECORDER_SOURCE)).digest('hex').slice(0, 12);
  const recorder = path.join(home, 'bin', `record-audio-${checksum}`);
  if (existsSync(recorder)) return { ok: true, recorder };

  report(`compiling the recorder into ${path.dirname(recorder)}`);
  mkdirSync(path.dirname(recorder), { recursive: true });
  const building = `${recorder}.building`;
  const outcome = await run({ command: 'swiftc', args: ['-O', '-o', building, RECORDER_SOURCE], env: {} });
  if (!outcome.ok) return { ok: false, message: `cannot compile the recorder: ${outcome.message}` };

  renameSync(building, recorder);
  return { ok: true, recorder };
}
