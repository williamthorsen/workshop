import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isRecord } from '../portable/is-record.ts';

/** The TTS provider and voice that aidemo reports for one scene, or `null` for a field that it does not record. */
export interface SceneVoice {
  readonly id: string;
  readonly provider: string | null;
  readonly voiceId: string | null;
}

/** The outcome of reading a voice manifest: each scene's voice in the manifest's order, or what is wrong with it. */
export type VoiceManifestReading = { ok: true; scenes: SceneVoice[] } | { ok: false; message: string };

/** Reads the voice of each scene from the `audio/voice.json` that aidemo writes in the demo's directory. */
export function readVoiceManifest(demoDir: string): VoiceManifestReading {
  const manifestPath = path.join(demoDir, 'audio', 'voice.json');
  if (!existsSync(manifestPath)) return { ok: false, message: `${manifestPath} not found` };

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return { ok: false, message: `${manifestPath} cannot be read (${describeError(error)})` };
  }

  const entries = isRecord(manifest) ? manifest['scenes'] : undefined;
  if (!Array.isArray(entries)) return { ok: false, message: `${manifestPath} does not list its scenes` };

  const scenes: SceneVoice[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry['id'] !== 'string') {
      return { ok: false, message: `${manifestPath} lists a scene without an id` };
    }
    scenes.push({ id: entry['id'], provider: readString(entry['provider']), voiceId: readString(entry['voice']) });
  }

  return { ok: true, scenes };
}

// region | Helpers

/** Returns a string value, or `null` for any other value. */
function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// endregion | Helpers
