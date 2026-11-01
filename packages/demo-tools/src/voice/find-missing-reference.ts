import type { VoiceConfig } from '../config/read-machine-config.ts';
import { isFile } from '../portable/is-file.ts';

/** Returns what is wrong when the configured reference recording or its transcript does not exist, naming the remedy. */
export function findMissingReference({
  referenceAudio,
  referenceTranscript,
}: Pick<VoiceConfig, 'referenceAudio' | 'referenceTranscript'>): string | undefined {
  if (!isFile(referenceAudio)) {
    return `voice.reference.audio names ${referenceAudio}, which does not exist; record it with thor-demo voice record`;
  }
  if (!isFile(referenceTranscript)) {
    return `voice.reference.transcript names ${referenceTranscript}, which does not exist; write in it exactly what the recording says`;
  }
  return undefined;
}
