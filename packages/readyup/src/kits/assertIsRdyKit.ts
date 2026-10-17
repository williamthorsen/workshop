import { z, type ZodError } from 'zod';

import { describeType, previewValue } from '../portable/describe-value.ts';
import { isRecord } from '../portable/isRecord.ts';
import type { RdyCheck, RdyKit } from './types.ts';

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
 * Zod 4 offers no composable `z.function()`, so the guard is a `z.custom`. Because a bare `z.custom`
 * reports "Invalid input", which tells an author nothing, the message names the type actually supplied.
 */
const FunctionSchema = z.custom<(...args: never[]) => unknown>((value) => typeof value === 'function', {
  error: (issue) => `expected a function, got ${describeType(issue.input)}`,
});

/**
 * Matches a dotted numeric version of up to three segments, the only shape that the runner's floor
 * comparison orders.
 */
const DOTTED_NUMERIC_VERSION = /^\d+(?:\.\d+){0,2}$/;

/**
 * Schema for the readyup version that a kit names as its floor.
 *
 * A floor is authored rather than read off an installed package, so it takes no range prefix and no
 * prerelease tail; rejecting those keeps a typo from silently never matching. A fourth
 * segment is rejected for the mirror reason: The comparison reads three, and would discard it.
 */
const MinReadyupVersionSchema = z
  .string({ error: (issue) => `expected a dotted numeric version, got ${describeType(issue.input)}` })
  .regex(DOTTED_NUMERIC_VERSION, {
    error: (issue) => `expected a dotted numeric version, got ${previewValue(issue.input)}`,
  });

/** Schema for the name that every check and checklist must have. */
const NameSchema = z.string('expected a non-empty string').min(1, 'expected a non-empty string');

/**
 * Schema for a single check, recursing into its dependent checks through a getter.
 *
 * `looseObject` lets unknown keys through: A kit authored against a later readyup, or with an
 * annotation about which this version knows nothing, is not thereby broken.
 *
 * `looseObject` reads every own enumerable key in order to pass unknown ones through, so removing
 * `fix` from the shape would stop it being type-checked without stopping it being invoked. The
 * preprocess leaves an accessor-valued one unread, and hides a builder-valued `checks`, whose checks are
 * validated when the runner builds them. A union of the two forms of `checks` would report a bad nested
 * check as an invalid union at `checks`, losing the path to the check.
 *
 * The annotation breaks an inference cycle: TypeScript cannot infer a type that recurses through
 * `z.preprocess`. Widening it changes nothing, because no caller reads the parsed output.
 */
const CheckSchema: z.ZodType = z.preprocess(
  hideDeferredFields,
  z.looseObject({
    name: NameSchema,
    id: NameSchema.optional(),
    check: FunctionSchema,
    severity: SeveritySchema.optional(),
    quiet: z.boolean().optional(),
    skip: FunctionSchema.optional(),
    fix: z.string().optional(),
    get checks() {
      return z
        .array(CheckSchema, {
          error: (issue) => `expected an array of checks or a function, got ${describeType(issue.input)}`,
        })
        .optional();
    },
  }),
);

/**
 * Fields common to flat and staged checklists.
 *
 * Both `checks` and `groups` are optional here and narrowed by the refinements below. Modelling the
 * two forms as one object rather than a union keeps validation errors precise: A union
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
 * A checklist with exactly one of `checks` and `groups`.
 *
 * The two clauses test different things, and each has to. `isFlatChecklist` discriminates on key
 * presence, so the exclusivity clause does too: A checklist whose `checks` is present but explicitly
 * `undefined`, beside a populated `groups`, would otherwise validate, classify as flat, and hand the
 * runner an array that is not there. Because the requirement clause tests the value instead, a key set
 * to `undefined` cannot satisfy the collection that it names.
 */
const ChecklistSchema = ChecklistShapeSchema.refine(
  (val) => val.checks !== undefined || val.groups !== undefined,
  "Checklist must have either 'checks' or 'groups'",
).refine((val) => !('checks' in val && 'groups' in val), "Checklist cannot have both 'checks' and 'groups'");

/** Schema for the checks returned by a builder, wrapped so that each issue path starts at `checks`. */
const BuiltCheckListSchema = z.object({
  checks: z.array(CheckSchema, {
    error: (issue) => `expected an array of checks, got ${describeType(issue.input)}`,
  }),
});

/** Structural schema for an RdyKit. */
const RdyKitSchema = z.looseObject({
  checklists: z.array(ChecklistSchema),
  defaultSeverity: SeveritySchema.optional(),
  description: z.string().optional(),
  failOn: SeveritySchema.optional(),
  fixLocation: FixLocationSchema.optional(),
  minReadyupVersion: MinReadyupVersionSchema.optional(),
  reportOn: SeveritySchema.optional(),
  suites: z.record(z.string(), z.array(z.string())).optional(),
});

/**
 * Validates the checks returned by a check's builder, as `assertIsRdyKit` validates a declared check.
 *
 * Throws an Error whose message names one issue per line, each located by a path rooted at `checks`.
 */
export function assertIsBuiltCheckList(raw: unknown): asserts raw is readonly RdyCheck[] {
  const result = BuiltCheckListSchema.safeParse({ checks: raw });
  if (result.success) return;
  throw new Error(formatValidationError(result.error, 'Invalid checks built by the check:'));
}

/**
 * Validates that a raw value conforms to the RdyKit shape, checks included.
 *
 * Every check is validated wherever it appears, so a typo'd severity or a non-function `check`
 * fails at load rather than silently changing what the run reports. Because jiti and esbuild
 * type-check nothing, `defineRdyKit`'s type-level guard protects only authors editing in an IDE.
 *
 * Throws an Error whose message names one issue per line, each located by a dot path into the kit.
 * `source` labels the kit to which the issues belong, which matters when the caller loaded it on the
 * author's behalf and the author never named it.
 */
export function assertIsRdyKit(raw: unknown, source?: string): asserts raw is RdyKit {
  const result = RdyKitSchema.safeParse(raw);
  if (result.success) return;
  const heading = source === undefined ? 'Invalid kit:' : `Invalid kit at ${source}:`;
  throw new Error(formatValidationError(result.error, heading));
}

/** Returns a heading plus one sentence per issue from a failed parse. */
function formatValidationError(error: ZodError, heading: string): string {
  const lines = error.issues.map((issue) => `  ${formatIssuePath(issue.path)}: ${issue.message}`);
  return [heading, ...lines].join('\n');
}

/**
 * Renders an issue path in the notation that an author would use to reach the value.
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
 * Returns the check as the schema should see it, with each deferred field hidden from the parse: an accessor-valued
 * `fix`, and a function-valued `checks`.
 *
 * Because a getter is deferred to the failure that renders it, validation must not read one. Hiding it behind a copy
 * that has no `fix` at all defers it; a data property passes through untouched. Because the copy contains descriptors
 * rather than values, building it invokes no other accessor on the check.
 */
function hideDeferredFields(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const fixDescriptor = Object.getOwnPropertyDescriptor(value, 'fix');
  const hidesFix = fixDescriptor !== undefined && !('value' in fixDescriptor);
  const checksDescriptor = Object.getOwnPropertyDescriptor(value, 'checks');
  const hidesBuilder = typeof checksDescriptor?.value === 'function';
  if (!hidesFix && !hidesBuilder) return value;

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (hidesFix) delete descriptors['fix'];
  if (hidesBuilder) delete descriptors['checks'];
  // `Reflect.getPrototypeOf` rather than `Object.getPrototypeOf`, which is declared to return `any`.
  return Object.create(Reflect.getPrototypeOf(value), descriptors);
}
