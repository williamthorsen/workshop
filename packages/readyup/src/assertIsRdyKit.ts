import type { ZodError } from 'zod';
import { z } from 'zod';

import type { RdyKit } from './types.ts';
import { describeType, previewValue } from './utils/describe-value.ts';

/** Schema for valid severity levels. */
const SeveritySchema = z.enum(['error', 'warn', 'recommend'], {
  error: (issue) => `expected one of "error", "warn", "recommend", got ${previewValue(issue.input)}`,
});

/** Schema for the placement of fix messages. */
const FixLocationSchema = z.enum(['inline', 'end'], {
  error: (issue) => `expected one of "inline", "end", got ${previewValue(issue.input)}`,
});

/**
 * Schema for a value that must be a function.
 *
 * Zod 4 offers no composable `z.function()`, so the guard is a `z.custom`. A bare `z.custom` reports
 * "Invalid input", which tells an author nothing, so the message names the type actually supplied.
 */
const FunctionSchema = z.custom<(...args: never[]) => unknown>((value) => typeof value === 'function', {
  error: (issue) => `expected a function, got ${describeType(issue.input)}`,
});

/** Schema for a display name, which every check and checklist must carry. */
const NameSchema = z.string('expected a non-empty string').min(1, 'expected a non-empty string');

/**
 * Schema for a single check, recursing into its dependent checks through a getter.
 *
 * `looseObject` lets unknown keys through: a kit authored against a later readyup, or carrying an
 * annotation this version knows nothing about, is not thereby broken.
 */
const CheckSchema = z.looseObject({
  name: NameSchema,
  check: FunctionSchema,
  severity: SeveritySchema.optional(),
  skip: FunctionSchema.optional(),
  fix: z.string().optional(),
  get checks() {
    return z.array(CheckSchema).optional();
  },
});

/**
 * Fields common to flat and staged checklists.
 *
 * Both `checks` and `groups` are optional here and narrowed by the refinements below. Modelling the
 * two forms as one object rather than a union is what keeps validation errors precise: a union
 * failure reports that neither branch matched, burying the offending check under an
 * `invalid_union` issue whose path stops at the checklist.
 */
const ChecklistShapeSchema = z.looseObject({
  name: NameSchema,
  preconditions: z.array(CheckSchema).optional(),
  checks: z.array(CheckSchema).optional(),
  groups: z.array(z.array(CheckSchema)).optional(),
  fixLocation: FixLocationSchema.optional(),
});

const ChecklistSchema = ChecklistShapeSchema.refine(
  (val) => val.checks !== undefined || val.groups !== undefined,
  "Checklist must have either 'checks' or 'groups'",
).refine(
  (val) => !(val.checks !== undefined && val.groups !== undefined),
  "Checklist cannot have both 'checks' and 'groups'",
);

/** Structural schema for an RdyKit. */
const RdyKitSchema = z.looseObject({
  checklists: z.array(ChecklistSchema),
  defaultSeverity: SeveritySchema.optional(),
  description: z.string().optional(),
  failOn: SeveritySchema.optional(),
  fixLocation: FixLocationSchema.optional(),
  reportOn: SeveritySchema.optional(),
  suites: z.record(z.string(), z.array(z.string())).optional(),
});

/**
 * Validate that a raw value conforms to the RdyKit shape, checks included.
 *
 * Every check is validated wherever it appears, so a typo'd severity or a non-function `check`
 * fails at load rather than silently changing what the run reports. jiti and esbuild type-check
 * nothing, so `defineRdyKit`'s type-level guard protects only authors editing in an IDE.
 *
 * Throws an Error whose message names one issue per line, each located by a dot path into the kit.
 * `source` labels the kit the issues belong to, which matters when the caller loaded it on the
 * author's behalf and the author never named it.
 */
export function assertIsRdyKit(raw: unknown, source?: string): asserts raw is RdyKit {
  const result = RdyKitSchema.safeParse(raw);
  if (result.success) return;
  throw new Error(formatValidationError(result.error, source));
}

/** Compose a heading plus one sentence per issue from a failed kit parse. */
function formatValidationError(error: ZodError, source: string | undefined): string {
  const heading = source === undefined ? 'Invalid kit:' : `Invalid kit at ${source}:`;
  const lines = error.issues.map((issue) => `  ${formatIssuePath(issue.path)}: ${issue.message}`);
  return [heading, ...lines].join('\n');
}

/**
 * Render an issue path in the notation an author would use to reach the value.
 *
 * Array indices become brackets and keys become dotted segments, so `checklists[0].checks[1].check`
 * reads as the expression that selects the offending field.
 */
function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return '(kit root)';

  return path.reduce<string>((rendered, segment) => {
    if (typeof segment === 'number') return `${rendered}[${segment}]`;
    return rendered === '' ? String(segment) : `${rendered}.${String(segment)}`;
  }, '');
}
