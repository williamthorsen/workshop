// Types
export type {
  AheadBehind,
  ChecklistSummary,
  CheckOutcome,
  CheckReturnValue,
  FailedResult,
  FixLocation,
  FractionProgress,
  LocalRefsCompareResult,
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
  SkippedResult,
  SkipResult,
  SummaryCounts,
} from './types.ts';

// Error taxonomy
export type { RdyErrorCode } from './errors.ts';

// JSON payload types, derived from the zod schemas that also generate the published JSON Schemas
export type {
  JsonCheckEntry,
  JsonChecklistEntry,
  JsonCompileKitEntry,
  JsonCompileOutput,
  JsonCompileStatus,
  JsonCounts,
  JsonDetail,
  JsonDriftStatus,
  JsonErrorBody,
  JsonErrorEnvelope,
  JsonKitEntry,
  JsonKitErrorEntry,
  JsonKitKind,
  JsonKitResultEntry,
  JsonListKitEntry,
  JsonListOutput,
  JsonProgress,
  JsonReport,
  JsonVerifyKitEntry,
  JsonVerifyOutput,
  JsonWarning,
  JsonWarningCode,
} from './schemas/index.ts';

// Type guards
export { isFlatChecklist, isPercentProgress } from './types.ts';

// Authoring helpers
export {
  defineChecklists,
  defineRdyChecklist,
  defineRdyConfig,
  defineRdyKit,
  defineRdyStagedChecklist,
} from './authoring.ts';

// Compile utilities
export { pickJson } from './compile/pickJson.ts';

// Manifest
export { DEFAULT_MANIFEST_PATH } from './manifest/manifestPath.ts';
export type { RdyManifest } from './manifest/manifestSchema.ts';
