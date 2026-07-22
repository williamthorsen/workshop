import { z } from 'zod';

/** Severity levels for assertive checks, ordered from most to least urgent. */
export const SeveritySchema = z.enum(['error', 'warn', 'recommend']).meta({ id: 'Severity' });

/**
 * Diagnosis of a failure that prevented rdy from completing an invocation.
 *
 * Mirrors the `RdyErrorCode` union in `errors.ts`, which is the taxonomy's prose home; a type test
 * keeps the two in step.
 */
export const ErrorCodeSchema = z.enum(['config', 'internal', 'kit-load', 'usage']).meta({ id: 'ErrorCode' });

/** The error body carried by the envelope and, verbatim, by a per-kit error entry inside a report. */
export const ErrorBodySchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string(),
  })
  .meta({ id: 'ErrorBody' });

/** Every count field is a non-negative integer. */
const CountSchema = z.int().min(0);

/**
 * Result tallies for one scope of a run — the whole report, one kit, or one checklist.
 *
 * `errors`/`warnings`/`recommendations` bucket failures by severity; `blocked` (precondition-skipped)
 * and `optional` (n/a-skipped) bucket skips by reason. Counts nest under their own object so they
 * share no namespace with the verdict and provenance fields beside them: a count added later cannot
 * collide with a top-level field, which is what makes the additive-evolution policy sound rather
 * than merely conventional.
 */
export const CountsSchema = z
  .object({
    passed: CountSchema,
    errors: CountSchema,
    warnings: CountSchema,
    recommendations: CountSchema,
    blocked: CountSchema,
    optional: CountSchema,
  })
  .meta({ id: 'Counts' });

/** Conditions a run reports as advisory rather than as a failure. */
export const WarningCodeSchema = z.enum(['version-skew']).meta({ id: 'WarningCode' });

/**
 * An advisory condition observed during a run.
 *
 * Mirrors the error body's `{code, message}` shape and adds `remedy`, the one action that clears the
 * condition. Warnings reach stderr in both modes; under `--json` they are additionally captured here,
 * because a consumer that owns only stdout would otherwise never see them.
 */
export const WarningSchema = z
  .object({
    code: WarningCodeSchema,
    message: z.string(),
    remedy: z.string().optional(),
  })
  .meta({ id: 'Warning' });

export type JsonSeverity = z.infer<typeof SeveritySchema>;
export type JsonErrorCode = z.infer<typeof ErrorCodeSchema>;
export type JsonErrorBody = z.infer<typeof ErrorBodySchema>;
export type JsonCounts = z.infer<typeof CountsSchema>;
export type JsonWarningCode = z.infer<typeof WarningCodeSchema>;
export type JsonWarning = z.infer<typeof WarningSchema>;
