import type { ZodError } from 'zod';
import { z } from 'zod';

import { describeType, previewValue } from '../portable/describe-value.ts';
import { isRecord } from '../portable/isRecord.ts';
import type { RdyKit } from './types.ts';

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

/** Schema for the name every check and checklist must carry. */
const NameSchema = z.string('expected a non-empty string').min(1, 'expected a non-empty string');

/**
 * Schema for a single check, recursing into its dependent checks through a getter.
 *
 * `looseObject` lets unknown keys through: a kit authored against a later readyup, or carrying an
 * annotation this version knows nothing about, is not thereby broken.
 *
 * `looseObject` reads every own enumerable key in order to pass unknown ones through, so removing
 * `fix` from the shape would stop it being type-checked without stopping it being invoked. The
 * preprocess is what leaves an accessor-valued one unread.
 *
 * The annotation breaks an inference cycle: TypeScript cannot infer a type that recurses through
 * `z.preprocess`. Widening it costs nothing, because no caller reads the parsed output.
 */
const CheckSchema: z.ZodType = z.preprocess(
  hideAccessorFix,
  z.looseObject({
    name: NameSchema,
    id: z.string().optional(),
    check: FunctionSchema,
    severity: SeveritySchema.optional(),
    quiet: z.boolean().optional(),
    skip: FunctionSchema.optional(),
    fix: z.string().optional(),
    get checks() {
      return z.array(CheckSchema).optional();
    },
  }),
);

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

/**
 * A checklist carrying exactly one of `checks` and `groups`.
 *
 * The two clauses test different things, and each has to. `isFlatChecklist` discriminates on key
 * presence, so the exclusivity clause does too: a checklist whose `checks` is present but explicitly
 * `undefined`, beside a populated `groups`, would otherwise validate, classify as flat, and hand the
 * runner an array that is not there. The requirement clause tests the value instead, so a key set to
 * `undefined` cannot satisfy the collection it names.
 */
const ChecklistSchema = ChecklistShapeSchema.refine(
  (val) => val.checks !== undefined || val.groups !== undefined,
  "Checklist must have either 'checks' or 'groups'",
).refine((val) => !('checks' in val && 'groups' in val), "Checklist cannot have both 'checks' and 'groups'");

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
 * Renders an issue path in the notation an author would use to reach the value.
 *
 * Array indices become brackets and keys become dotted segments, so `checklists[0].checks[1].check`
 * reads as the expression that selects the offending field.
 */
function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return '(kit root)';

  return path
    .map((segment, index) => {
      if (typeof segment === 'number') return `[${segment}]`;
      return index === 0 ? String(segment) : `.${String(segment)}`;
    })
    .join('');
}

/**
 * Returns the check as the schema should see it, with an accessor-valued `fix` hidden from the parse.
 *
 * A getter is deferred to the failure that renders it, so validation must not read one. Hiding it
 * behind a copy that has no `fix` at all is what defers it; a data property passes through untouched.
 * The copy carries descriptors rather than values, so no other accessor on the check is invoked by
 * building it.
 */
function hideAccessorFix(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const descriptor = Object.getOwnPropertyDescriptor(value, 'fix');
  if (descriptor === undefined || 'value' in descriptor) return value;

  const descriptors = Object.getOwnPropertyDescriptors(value);
  delete descriptors['fix'];
  // `Reflect.getPrototypeOf` rather than `Object.getPrototypeOf`, which is declared to return `any`.
  return Object.create(Reflect.getPrototypeOf(value), descriptors);
}
