/**
 * Source declarations: which content sources a config tier adds, and which inherited ones it drops.
 *
 * Part of the authored config contract, under the normalizing and idempotence rules `config-schemas.ts` states.
 */

import { z } from 'zod';

import { SourceOriginSchema } from './descriptor-schemas.ts';

/**
 * One declared content source, in either the authored or the normalized spelling.
 *
 * `path` and `package` are the two authored spellings of the plan schema's source origins, and `origin` is what they
 * normalize to. A source declares exactly one of the three. The location stays as authored: resolving it against the
 * declaring tier is `resolveSources`' job, so a plan reports the path a consumer wrote rather than where it landed.
 */
export const DeclaredSourceSchema = z.union([
  z
    .object({
      name: z.string().min(1),
      path: z.string().min(1),
      package: z.never().optional(),
      origin: z.never().optional(),
    })
    .transform(({ name, path }) => ({ name, origin: { kind: 'directory' as const, location: path } })),
  z
    .object({
      name: z.string().min(1),
      package: z.string().min(1),
      path: z.never().optional(),
      origin: z.never().optional(),
    })
    .transform(({ name, package: location }) => ({ name, origin: { kind: 'package' as const, location } })),
  z
    .object({
      name: z.string().min(1),
      origin: SourceOriginSchema,
      path: z.never().optional(),
      package: z.never().optional(),
    })
    .transform(({ name, origin }) => ({ name, origin })),
]);

/**
 * One tier's source declarations: the sources it adds, and the inherited names it drops.
 *
 * `drop` names sources rather than containing entries, because a name is the whole of what identifies one.
 */
export const SourceDeclarationSchema = z.strictObject({
  use: z.array(DeclaredSourceSchema).default([]),
  drop: z.array(z.string().min(1)).default([]),
});

export type DeclaredSource = z.infer<typeof DeclaredSourceSchema>;
export type SourceDeclaration = z.infer<typeof SourceDeclarationSchema>;
