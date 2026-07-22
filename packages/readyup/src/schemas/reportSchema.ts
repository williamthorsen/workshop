import { z } from 'zod';

import { CountsSchema, ErrorBodySchema, SeveritySchema, WarningSchema } from './common.ts';

/**
 * Version of the run-report payload.
 *
 * Bumped when a field is removed, renamed, or re-typed — never when an optional field is added.
 */
export const SCHEMA_VERSION = 1;

/** How much of the detail tree a report carries. */
export const DetailSchema = z.enum(['summary', 'full']).meta({ id: 'Detail' });

/** Progress a check reported alongside its verdict, discriminated by `type`. */
export const ProgressSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('fraction'),
      passedCount: z.int().min(0),
      count: z.int().min(0),
    }),
    z.object({
      type: z.literal('percent'),
      percent: z.number(),
    }),
  ])
  .meta({ id: 'Progress' });

/**
 * One check result in a checklist's detail tree.
 *
 * `ok` is three-valued rather than optional: `null` is the verdict a skipped check has, not a
 * missing field. Every other optional field is omitted when it carries nothing, so a passed check
 * with no detail serializes to five keys. Nesting is recursive — `checks` holds the results of
 * checks that ran only because this one passed.
 */
export const CheckEntrySchema = z
  .object({
    name: z.string(),
    status: z.enum(['passed', 'failed', 'skipped']),
    ok: z.union([z.boolean(), z.null()]),
    severity: SeveritySchema,
    durationMs: z.int().min(0),
    skipReason: z.enum(['n/a', 'precondition']).optional(),
    detail: z.string().optional(),
    fix: z.string().optional(),
    error: z.string().optional(),
    progress: ProgressSchema.optional(),
    get checks() {
      return z.array(CheckEntrySchema).optional();
    },
  })
  .meta({ id: 'CheckEntry' });

/** One checklist's verdict, tallies, and detail tree. */
export const ChecklistEntrySchema = z
  .object({
    name: z.string(),
    passed: z.boolean(),
    counts: CountsSchema,
    worstSeverity: SeveritySchema.optional(),
    durationMs: z.int().min(0),
    checks: z.array(CheckEntrySchema).optional(),
  })
  .meta({ id: 'ChecklistEntry' });

/** A kit that ran, grouping its checklists under a kit-level verdict and tallies. */
export const KitResultEntrySchema = z
  .object({
    name: z.string(),
    passed: z.boolean(),
    counts: CountsSchema,
    worstSeverity: SeveritySchema.optional(),
    durationMs: z.int().min(0),
    checklists: z.array(ChecklistEntrySchema),
  })
  .meta({ id: 'KitResultEntry' });

/**
 * A kit that produced no results, carrying the same error body as the envelope.
 *
 * Deliberately counts-free and verdict-free: a kit that never ran has no `errors: 0` to report and
 * no verdict to give, and emitting either would misstate the run.
 */
export const KitErrorEntrySchema = z
  .object({
    name: z.string(),
    error: ErrorBodySchema,
  })
  .meta({ id: 'KitErrorEntry' });

/** One kit's entry, told apart by whether `error` is present. */
export const KitEntrySchema = z.union([KitErrorEntrySchema, KitResultEntrySchema]).meta({ id: 'KitEntry' });

/**
 * Top-level shape of `rdy run --json`.
 *
 * `passed` is the run verdict: true when every requested kit produced results and no result at or
 * above `failOn` failed, which makes it agree with exit code 0 in every case. A report is only ever
 * emitted once the run reaches its kits, so `passed: false` means "ran, but incompletely or with
 * failures" and never "could not start" — that failure produces the error envelope instead.
 *
 * `failOn`, `reportOn`, and `detail` echo the thresholds the run resolved, so a consumer holding
 * only the payload can tell a clean run from one whose failures were filtered out of view.
 */
export const ReportSchema = z
  .object({
    schemaVersion: z.int().min(1),
    readyupVersion: z.string(),
    passed: z.boolean(),
    counts: CountsSchema,
    worstSeverity: SeveritySchema.optional(),
    failOn: SeveritySchema,
    reportOn: SeveritySchema,
    detail: DetailSchema,
    durationMs: z.int().min(0),
    warnings: z.array(WarningSchema).optional(),
    kits: z.array(KitEntrySchema),
  })
  .meta({ id: 'Report' });

export type JsonDetail = z.infer<typeof DetailSchema>;
export type JsonProgress = z.infer<typeof ProgressSchema>;
export type JsonCheckEntry = z.infer<typeof CheckEntrySchema>;
export type JsonChecklistEntry = z.infer<typeof ChecklistEntrySchema>;
export type JsonKitResultEntry = z.infer<typeof KitResultEntrySchema>;
export type JsonKitErrorEntry = z.infer<typeof KitErrorEntrySchema>;
export type JsonKitEntry = z.infer<typeof KitEntrySchema>;
export type JsonReport = z.infer<typeof ReportSchema>;
