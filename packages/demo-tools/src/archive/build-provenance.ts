import type { SourceState } from '../clients/git/read-source-state.ts';
import type { SpeechSampling } from '../voice/mlx-audio/build-speech-request.ts';
import type { SceneVoice } from './read-voice-manifest.ts';

/** A file's checksum and size, as recorded for an archived file. */
export interface FileDigest {
  readonly bytes: number;
  readonly sha256: string;
}

/** The record of what produced a take, written to the take's `provenance.json`. */
export interface Provenance {
  readonly schemaVersion: 2;
  readonly demo: string;
  readonly label: string;
  /** The UTC instant, as ISO 8601, at which `thor-demo` started aidemo. */
  readonly renderedAt: string;
  readonly source: { readonly commit: string | null; readonly dirty: boolean | null };
  readonly engine: { readonly package: '@tandryukha/aidemo'; readonly version: string };
  /** Each scene's voice, and for a cloned voice the sampling values that every speech request set, when any did. */
  readonly voice: { readonly scenes: readonly SceneVoice[]; readonly sampling?: SpeechSampling };
  /** The checksum of the reference recording that a cloned voice copies; absent for any other voice. */
  readonly reference?: { readonly sha256: string };
  /** The arguments given to aidemo after the demo directory. */
  readonly params: readonly string[];
  readonly storyboard: { readonly sha256: string };
  /** The archived files other than this record, keyed by name. */
  readonly files: Readonly<Record<string, FileDigest>>;
}

/** What a provenance record is built from. */
export interface ProvenanceInput {
  readonly aidemoVersion: string;
  readonly demo: string;
  readonly files: Readonly<Record<string, FileDigest>>;
  readonly label: string;
  readonly params: readonly string[];
  readonly reference?: { readonly sha256: string };
  readonly renderedAt: Date;
  readonly sampling?: SpeechSampling;
  readonly source: SourceState | undefined;
  readonly storyboardSha256: string;
  /** The voice of each scene, in the order of aidemo's voice manifest. */
  readonly voices: readonly SceneVoice[];
}

/**
 * Builds a take's provenance record, ordering `files` and the sampling fields by name so that the record is stable,
 * and omitting a sampling that sets nothing.
 */
export function buildProvenance(input: ProvenanceInput): Provenance {
  const sampling = Object.entries(input.sampling ?? {}).toSorted(([left], [right]) => left.localeCompare(right));
  return {
    schemaVersion: 2,
    demo: input.demo,
    label: input.label,
    renderedAt: input.renderedAt.toISOString(),
    source: { commit: input.source?.commit ?? null, dirty: input.source?.dirty ?? null },
    engine: { package: '@tandryukha/aidemo', version: input.aidemoVersion },
    voice: {
      scenes: input.voices.map(({ id, provider, voiceId }) => ({ id, provider, voiceId })),
      ...(sampling.length > 0 && { sampling: Object.fromEntries(sampling) }),
    },
    ...(input.reference !== undefined && { reference: { sha256: input.reference.sha256 } }),
    params: [...input.params],
    storyboard: { sha256: input.storyboardSha256 },
    files: Object.fromEntries(Object.entries(input.files).toSorted(([left], [right]) => left.localeCompare(right))),
  };
}
