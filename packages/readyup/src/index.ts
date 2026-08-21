// Types
export type {
  AheadBehind,
  CheckOutcome,
  CheckReturnValue,
  FailedResult,
  FindingOutcome,
  FixLocation,
  FractionProgress,
  LocalRefsCompareResult,
  OutcomeFinding,
  PassedResult,
  PercentProgress,
  Progress,
  RdyCheck,
  RdyChecklist,
  RdyConfig,
  RdyKit,
  RdyReport,
  RdyResult,
  RdyStagedChecklist,
  RemoteRefCompareResult,
  ResolvedRdyConfig,
  Severity,
  SkipDiagnosis,
  SkippedResult,
  SkipResult,
  SummaryCounts,
} from './kits/types.ts';

// Error taxonomy
export type { RdyErrorCode } from './errors/RdyError.ts';

// JSON payload types, derived from the zod schemas that also generate the published JSON Schemas
export type { JsonCounts, JsonErrorBody, JsonWarning, JsonWarningCode } from './schemas/common.ts';
export type { JsonCompileKitEntry, JsonCompileOutput, JsonCompileStatus } from './schemas/compileOutputSchema.ts';
export type { JsonErrorEnvelope } from './schemas/errorEnvelopeSchema.ts';
export type { JsonKitKind, JsonListKitEntry, JsonListOutput } from './schemas/listOutputSchema.ts';
export type {
  JsonCheckEntry,
  JsonChecklistEntry,
  JsonDetail,
  JsonKitEntry,
  JsonKitErrorEntry,
  JsonKitResultEntry,
  JsonProgress,
  JsonReport,
} from './schemas/reportSchema.ts';
export type {
  JsonDriftStatus,
  JsonSourceStatus,
  JsonVerifyKitEntry,
  JsonVerifyOutput,
} from './schemas/verifyOutputSchema.ts';

// Type guards
export { isFlatChecklist, isPercentProgress } from './kits/types.ts';

// Authoring helpers
export {
  defineChecklists,
  defineRdyChecklist,
  defineRdyConfig,
  defineRdyKit,
  defineRdyStagedChecklist,
} from './kits/authoring.ts';

// Compile utilities
export { pickJson } from './compile/pickJson.ts';

// Manifest
export { DEFAULT_MANIFEST_PATH } from './manifest/manifestPath.ts';
export type { RdyManifest } from './manifest/manifestSchema.ts';
