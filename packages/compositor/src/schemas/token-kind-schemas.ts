/** Token kinds: what the engine recognizes in a body, and what each match resolves to. */

import { z } from 'zod';

import { TokenKindDescriptorSchema } from './descriptor-schemas.ts';
import { IdSchema } from './scalar-schemas.ts';

/**
 * One token kind as the engine reads it: the plan's descriptor, plus the pattern it matches and how a match resolves.
 *
 * `mapping` resolves its capture through the target's mapping table and contributes no edge; a capture the table does
 * not map fails the render rather than passing through, since an unmapped name would address something the destination
 * does not have. `referent` reads its capture as the slug of an artifact of `artifactKindId`, contributes a closure
 * edge, and renders the name that artifact deploys under for the target. A kind rendering its own capture is the
 * degenerate referent, so one shape covers both.
 *
 * Extends the plan's descriptor, so a declaration parses as a plan's `tokenKinds` entry and the two cannot drift.
 *
 * `pattern` holds a regular-expression source rather than a compiled expression, which keeps a declaration
 * serializable. The engine owns the flags and compiles with `g` alone, so no declaration can widen a match across
 * lines. That a pattern compiles and has exactly one capture group is checked in
 * `assertTokenKindsAreConsistent`: a refinement here would be invisible to `z.toJSONSchema`.
 */
export const TokenKindSchema = z
  .discriminatedUnion('form', [
    TokenKindDescriptorSchema.extend({ form: z.literal('mapping'), pattern: z.string() }).meta({
      id: 'MappingTokenKind',
    }),
    TokenKindDescriptorSchema.extend({
      form: z.literal('referent'),
      pattern: z.string(),
      artifactKindId: IdSchema,
    }).meta({ id: 'ReferentTokenKind' }),
  ])
  .meta({ id: 'TokenKind' });

export type TokenKind = z.infer<typeof TokenKindSchema>;
