import { z } from 'zod';

import type { RdyKit } from './types.ts';

/** Schema for valid severity levels. */
const SeveritySchema = z.enum(['error', 'warn', 'recommend']);

/** Schema for a flat checklist (has `checks`, no `groups`). */
const FlatChecklistSchema = z.looseObject({
  name: z.string().min(1),
  checks: z.array(z.unknown()),
});

/** Schema for a staged checklist (has `groups`, no `checks`). */
const StagedChecklistSchema = z.looseObject({
  name: z.string().min(1),
  groups: z.array(z.unknown()),
});

const ChecklistSchema = z
  .union([FlatChecklistSchema, StagedChecklistSchema])
  .refine((val) => !('checks' in val && 'groups' in val), {
    message: "Checklist cannot have both 'checks' and 'groups'",
  });

/** Structural schema for an RdyKit. */
const RdyKitSchema = z.looseObject({
  checklists: z.array(ChecklistSchema),
  defaultSeverity: SeveritySchema.optional(),
  description: z.string().optional(),
  failOn: SeveritySchema.optional(),
  fixLocation: z.enum(['inline', 'end']).optional(),
  reportOn: SeveritySchema.optional(),
  suites: z.record(z.string(), z.array(z.string())).optional(),
});

/**
 * Validate that a raw value conforms to the RdyKit shape.
 *
 * Throws a ZodError on invalid input. When it returns without throwing, the value is a valid
 * RdyKit. Function-valued properties like `check` are passed through without
 * validation because jiti loads the actual TypeScript module and preserves original types.
 */
export function assertIsRdyKit(raw: unknown): asserts raw is RdyKit {
  RdyKitSchema.parse(raw);
}
