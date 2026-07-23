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

/** The advisory vocabulary this version raises. `RaisedWarning` binds producers to it. */
export const WarningCodeSchema = z.enum(['version-skew']);

/**
 * The wire form of a warning code: a known value, or any other string.
 *
 * Open where `ErrorCodeSchema` is closed, because the two vocabularies do different jobs. An error
 * code selects a consumer's branch, so an unknown one leaves the consumer with nothing to dispatch
 * on and earns its version bump. A warning labels an advisory whose `message` and `remedy` a
 * consumer can display verbatim, so a code it has never heard of must still validate: closing this
 * set would make the first new advisory a breaking change. The union keeps the known values visible
 * in the generated schema's `anyOf` rather than trading them for a bare `string`.
 */
const WarningCodeWireSchema = WarningCodeSchema.or(z.string()).meta({ id: 'WarningCode' });

/**
 * An advisory condition observed during a run.
 *
 * Mirrors the error body's `{code, message}` shape and adds `remedy`, the one action that clears the
 * condition. Warnings reach stderr in both modes; under `--json` they are additionally captured here,
 * because a consumer that owns only stdout would otherwise never see them.
 */
export const WarningSchema = z
  .object({
    code: WarningCodeWireSchema,
    message: z.string(),
    remedy: z.string().optional(),
  })
  .meta({ id: 'Warning' });

export type JsonSeverity = z.infer<typeof SeveritySchema>;
export type JsonErrorCode = z.infer<typeof ErrorCodeSchema>;
export type JsonErrorBody = z.infer<typeof ErrorBodySchema>;
export type JsonCounts = z.infer<typeof CountsSchema>;
/**
 * A warning code: one of the known values, or any other string.
 *
 * Assembled rather than inferred from the wire schema, because `z.infer` on a `literal | string`
 * union collapses to plain `string`, which would drop the known values from the published type.
 */
export type JsonWarningCode = z.infer<typeof WarningCodeSchema> | (string & {});
export type JsonWarning = z.infer<typeof WarningSchema>;

/**
 * A warning as this version raises it, narrower than `JsonWarning` on `code`.
 *
 * The wire type accepts any string so a consumer tolerates an advisory from a later readyup. A
 * producer may only emit a code this version declares, so a mistyped one fails to compile rather
 * than entering the published vocabulary.
 */
export type RaisedWarning = JsonWarning & { code: z.infer<typeof WarningCodeSchema> };
