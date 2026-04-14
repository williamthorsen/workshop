// Types
export type {
  AheadBehind,
  ChecklistSummary,
  CheckOutcome,
  CheckReturnValue,
  FailedResult,
  FixLocation,
  FractionProgress,
  JsonCheckEntry,
  JsonChecklistEntry,
  JsonKitEntry,
  JsonReport,
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
export type { RdyManifest } from './manifest/manifestSchema.ts';
export { DEFAULT_MANIFEST_PATH } from './manifest/manifestSchema.ts';

// Check utilities
export {
  commandExists,
  compareLocalRefs,
  compareRefToRemote,
  compareVersions,
  computeHash,
  fileContains,
  fileDoesNotContain,
  fileExists,
  fileMatchesHash,
  filesExist,
  getJsonValue,
  hasDevDependency,
  hasJsonField,
  hasJsonFields,
  hasJsonValue,
  hasMinDevDependencyVersion,
  hasPackageJsonField,
  isRecord,
  makeLocalRefSyncCheck,
  makeRemoteRefSyncCheck,
  readFile,
  readJsonFile,
  readJsonValue,
  readPackageJson,
  runGit,
} from './check-utils/index.ts';
