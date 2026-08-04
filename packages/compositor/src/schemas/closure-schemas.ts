/** Closure: the artifacts a selection reaches, and the edges that reached them. */

import { z } from 'zod';

import { KindDescriptorSchema, SourceEntrySchema, TierDescriptorSchema } from './descriptor-schemas.ts';
import { PartialEntrySchema, PresentArtifactSchema } from './graph-schemas.ts';
import { IdSchema } from './scalar-schemas.ts';

/**
 * Version of the closure payload.
 *
 * Bumped when a field is removed, renamed, or re-typed, never when an optional field is added. Independent of the plan's
 * version: the two contracts share the artifact shape but evolve on their own schedules.
 */
export const CLOSURE_SCHEMA_VERSION = 1;

/**
 * One artifact the closure reached.
 *
 * Derived from the plan's present artifact rather than declared beside it, so the edge, seed, and resolution shapes
 * cannot drift from what a plan carries. `status` is what a plan adds: it measures an artifact against current target
 * state, which a closure has not looked at.
 */
export const ClosureArtifactSchema = PresentArtifactSchema.omit({ status: true }).meta({ id: 'ClosureArtifact' });

/**
 * Where in the content a diagnostic belongs.
 *
 * `key` names the frontmatter key at fault, and is absent when the artifact as a whole is: a block that would not parse,
 * or an edge that closed a cycle.
 */
export const ClosureEntryRefSchema = z
  .object({ artifactId: IdSchema, key: z.string().optional() })
  .meta({ id: 'ClosureEntryRef' });

/**
 * One fault the closure found, attached to the artifact responsible.
 *
 * A fault is data rather than a thrown error, so one run reports every mistake in a content tree and a reader attaches
 * each to the file an author wrote. `cycle` names the artifacts a dependency cycle runs through, in the order the walk
 * met them, and is present only on a `dependency-cycle`; that placement is checked by the exported assertion, a
 * refinement here being invisible to `z.toJSONSchema`.
 *
 * The artifact an `unknown-reference` names is carried by the message rather than by a field, because it is by
 * definition an id no table resolves: as a field it would be the one dangling reference the assertion had to exempt.
 */
export const ClosureDiagnosticSchema = z
  .object({
    code: z.enum(['dependency-cycle', 'invalid-declaration', 'misplaced-key', 'unknown-reference']),
    message: z.string(),
    at: ClosureEntryRefSchema,
    cycle: z.array(IdSchema).optional(),
  })
  .meta({ id: 'ClosureDiagnostic' });

/**
 * Every artifact a selection reaches, with the edges that reached it and the faults met on the way.
 *
 * Its own contract rather than a stage inside the plan's: a consumer recomputing a closure over an edited config holds
 * one of these long before any target is chosen, and the What-if flow is exactly that recomputation.
 *
 * `artifacts` and `partials` run lexicographically by id, `kinds` and `tiers` in the order a plan carries them, and
 * `sources` in precedence order, so two closures of the same shape diff cleanly. `diagnostics` runs in the order the
 * faults were found, which is deterministic because the reads and the walk both are.
 */
export const ClosureSchema = z
  .object({
    schemaVersion: z.int().min(1),
    kinds: z.array(KindDescriptorSchema),
    sources: z.array(SourceEntrySchema),
    tiers: z.array(TierDescriptorSchema),
    artifacts: z.array(ClosureArtifactSchema),
    partials: z.array(PartialEntrySchema),
    diagnostics: z.array(ClosureDiagnosticSchema),
  })
  .meta({ id: 'Closure' });

export type Closure = z.infer<typeof ClosureSchema>;
export type ClosureArtifact = z.infer<typeof ClosureArtifactSchema>;
export type ClosureDiagnostic = z.infer<typeof ClosureDiagnosticSchema>;
export type ClosureEntryRef = z.infer<typeof ClosureEntryRefSchema>;
