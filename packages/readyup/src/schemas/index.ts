// Shared building blocks
export type {
  JsonCounts,
  JsonErrorBody,
  JsonErrorCode,
  JsonSeverity,
  JsonWarning,
  JsonWarningCode,
  RaisedWarning,
} from './common.ts';
export {
  CountsSchema,
  ErrorBodySchema,
  ErrorCodeSchema,
  SeveritySchema,
  WarningCodeSchema,
  WarningSchema,
} from './common.ts';

// Run report
export type {
  JsonCheckEntry,
  JsonChecklistEntry,
  JsonDetail,
  JsonKitEntry,
  JsonKitErrorEntry,
  JsonKitResultEntry,
  JsonProgress,
  JsonReport,
} from './reportSchema.ts';
export {
  CheckEntrySchema,
  ChecklistEntrySchema,
  DetailSchema,
  KitEntrySchema,
  KitErrorEntrySchema,
  KitResultEntrySchema,
  ProgressSchema,
  ReportSchema,
} from './reportSchema.ts';

// Error envelope
export type { JsonErrorEnvelope } from './errorEnvelopeSchema.ts';
export { ErrorEnvelopeSchema } from './errorEnvelopeSchema.ts';

// list
export type { JsonKitKind, JsonListKitEntry, JsonListOutput } from './listOutputSchema.ts';
export { KitKindSchema, ListKitEntrySchema, ListOutputSchema } from './listOutputSchema.ts';

// verify
export type { JsonDriftStatus, JsonVerifyKitEntry, JsonVerifyOutput } from './verifyOutputSchema.ts';
export { DriftStatusSchema, VerifyKitEntrySchema, VerifyOutputSchema } from './verifyOutputSchema.ts';

// compile
export type { JsonCompileKitEntry, JsonCompileOutput, JsonCompileStatus } from './compileOutputSchema.ts';
export { CompileKitEntrySchema, CompileOutputSchema, CompileStatusSchema } from './compileOutputSchema.ts';
