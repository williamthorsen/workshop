import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import type { ReportedWarning } from '../output/writeWarnings.ts';
import type {
  JsonVerifyKitEntry,
  JsonVerifyProjectEntry,
  JsonVerifyUncompiledEntry,
} from '../schemas/verifyOutputSchema.ts';
import type { KitVerdicts } from './verdicts.ts';

/** One manifest's contribution to a verify run. */
export interface ManifestVerification {
  kits: JsonVerifyKitEntry[];
  /** `true` when every kit in the manifest passed and every selected source is recorded. */
  passed: boolean;
  uncompiled: JsonVerifyUncompiledEntry[];
}

/**
 * One step boundary of a verify run, in the order in which the steps run.
 *
 * Every run ends with exactly one `verifyFinished` event.
 */
export type VerifyEvent =
  | { kind: 'discoveryFinished'; warnings: readonly ReportedWarning[] }
  | {
      kind: 'manifestStarted';
      kitCount: number;
      /** The manifest's path relative to the working directory. */
      manifestPath: string;
    }
  | { kind: 'kitVerified'; kit: RdyManifestKit; verdicts: KitVerdicts }
  | { kind: 'manifestFinished'; failedCount: number; totalCount: number; uncompiled: JsonVerifyUncompiledEntry[] }
  | { kind: 'projectFailed'; message: string; project: string }
  | { kind: 'verifyFinished'; outcome: VerifyOutcome };

/** A verify run's result, before it is emitted. */
export interface VerifyOutcome extends ManifestVerification {
  /** Every project that a recursive verify visited; absent from any other run. */
  projects?: JsonVerifyProjectEntry[];
}
