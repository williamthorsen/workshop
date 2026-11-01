import type { SourceState } from '../clients/git/read-source-state.ts';
import type { ResolvedVoice } from './resolve-voice.ts';

/** A file's checksum and size, as recorded for an archived file. */
export interface FileDigest {
  readonly bytes: number;
  readonly sha256: string;
}

/** The record of what produced a take, written to the take's `provenance.json`. */
export interface Provenance {
  readonly schemaVersion: 1;
  readonly demo: string;
  readonly label: string;
  /** The UTC instant, as ISO 8601, at which `thor-demo` started aidemo. */
  readonly renderedAt: string;
  readonly source: { readonly commit: string | null; readonly dirty: boolean | null };
  readonly engine: { readonly package: '@tandryukha/aidemo'; readonly version: string };
  readonly voice: ResolvedVoice;
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
  readonly source: SourceState | undefined;
  readonly storyboardSha256: string;
  readonly voice: ResolvedVoice;
}

/** Builds a take's provenance record, ordering `files` by name so that the record is stable. */
export function buildProvenance(input: ProvenanceInput): Provenance {
  return {
    schemaVersion: 1,
    demo: input.demo,
    label: input.label,
    renderedAt: input.renderedAt.toISOString(),
    source: { commit: input.source?.commit ?? null, dirty: input.source?.dirty ?? null },
    engine: { package: '@tandryukha/aidemo', version: input.aidemoVersion },
    voice: { provider: input.voice.provider, voiceId: input.voice.voiceId },
    ...(input.reference !== undefined && { reference: { sha256: input.reference.sha256 } }),
    params: [...input.params],
    storyboard: { sha256: input.storyboardSha256 },
    files: Object.fromEntries(Object.entries(input.files).toSorted(([left], [right]) => left.localeCompare(right))),
  };
}
