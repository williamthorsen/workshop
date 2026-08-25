/** Edge rules: the frontmatter keys a consumer declares as the source of dependency edges. */

import { z } from 'zod';

import { EdgeOriginSchema } from './graph-schemas.ts';
import { IdSchema } from './scalar-schemas.ts';

/**
 * The origin an edge read from frontmatter may have.
 *
 * `token` is excluded: it names an edge an invocation token in a body contributed, which reaches the graph through the
 * contributor seam rather than through a key. A rule claiming it would attribute to a body what an author declared.
 */
export const FrontmatterEdgeOriginSchema = EdgeOriginSchema.exclude(['token']).meta({ id: 'FrontmatterEdgeOrigin' });

/**
 * The token standing for every artifact the declaring artifact's own source contains.
 *
 * It rides on the rule that admits it rather than on the declaration as a whole, so one key can expand it while another
 * reads the same text as a slug.
 */
export const EdgeWildcardSchema = z
  .object({ token: z.string().min(1), via: FrontmatterEdgeOriginSchema })
  .meta({ id: 'EdgeWildcard' });

/**
 * One frontmatter key that yields dependency edges, and how a reader takes it.
 *
 * `kind-keyed` holds a mapping of declaration key to slug list, so one key declares edges across several kinds; `flat`
 * holds a bare list of slugs naming one kind. The two are told apart by `form`, which is what makes `targetKindId`
 * required exactly where it means something. Only the kind-keyed form admits a wildcard, which is where the port needs
 * one; extending it to the flat form later adds an optional field and breaks no consumer.
 *
 * `kindId` names the kind whose artifacts declare the key, never the kind its slugs name.
 */
export const EdgeRuleSchema = z
  .discriminatedUnion('form', [
    z
      .object({
        kindId: IdSchema,
        key: z.string().min(1),
        via: FrontmatterEdgeOriginSchema,
        form: z.literal('kind-keyed'),
        wildcard: EdgeWildcardSchema.optional(),
      })
      .meta({ id: 'KindKeyedEdgeRule' }),
    z
      .object({
        kindId: IdSchema,
        key: z.string().min(1),
        via: FrontmatterEdgeOriginSchema,
        form: z.literal('flat'),
        targetKindId: IdSchema,
      })
      .meta({ id: 'FlatEdgeRule' }),
  ])
  .meta({ id: 'EdgeRule' });

/**
 * The declaration keys a kind-keyed block is written in, mapped to the kinds they name.
 *
 * One map serves every kind-keyed rule, because a key names the same kind whichever block it appears in. Holding it
 * beside the rules rather than inside each of them is what keeps a consumer from restating the vocabulary per key.
 */
export const KindKeysSchema = z.record(z.string().min(1), IdSchema).meta({ id: 'KindKeys' });

export type EdgeRule = z.infer<typeof EdgeRuleSchema>;
export type EdgeWildcard = z.infer<typeof EdgeWildcardSchema>;
export type FrontmatterEdgeOrigin = z.infer<typeof FrontmatterEdgeOriginSchema>;
export type KindKeys = z.infer<typeof KindKeysSchema>;
