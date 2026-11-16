import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { isRecord } from '@williamthorsen/toolbelt.objects';

/** The outcome of shifting a gap into a voice manifest: success, or what is wrong with the manifest. */
export type GapShiftOutcome = { ok: true } | { ok: false; message: string };

/**
 * Moves `extraGapMs` of each scene's `durationMs` into `gapMs` in the `audio/voice.json` that aidemo's `voice` stage
 * writes, so that the silence padded onto every clip counts as gap rather than speech. aidemo 0.20.3 through 0.20.6
 * time offline captions over each scene's `durationMs` and fit each scene's footage to `durationMs + gapMs`, so the
 * shift keeps the footage and moves every caption out of the gap. Every other field is kept as aidemo wrote it.
 */
export function shiftGapIntoManifest(demoDir: string, extraGapMs: number): GapShiftOutcome {
  const manifestPath = path.join(demoDir, 'audio', 'voice.json');
  if (!existsSync(manifestPath)) return { ok: false, message: `${manifestPath} not found` };

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return { ok: false, message: `${manifestPath} cannot be read (${describeError(error)})` };
  }

  const malformed = { ok: false, message: `${manifestPath} does not record a gap and a duration for every scene` };
  if (!isRecord(manifest)) return malformed;
  const { gapMs, scenes: entries } = manifest;
  if (!isDuration(gapMs) || !Array.isArray(entries)) return malformed;

  const scenes: unknown[] = [];
  for (const scene of entries) {
    if (!isRecord(scene) || !isDuration(scene['durationMs'])) return malformed;
    scenes.push({ ...scene, durationMs: Math.max(0, scene['durationMs'] - extraGapMs) });
  }

  const shifted = { ...manifest, gapMs: gapMs + extraGapMs, scenes };
  writeFileSync(manifestPath, `${JSON.stringify(shifted, null, 2)}\n`);
  return { ok: true };
}

// region | Helpers

/** Reports whether a value is a finite number of milliseconds, 0 or more. */
function isDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// endregion | Helpers
