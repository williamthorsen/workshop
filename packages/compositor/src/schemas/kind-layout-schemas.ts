/** Kind layout: how a directory holds the artifacts of one kind. */

import { z } from 'zod';

/**
 * How artifacts of one kind are laid out inside a directory.
 *
 * `file` is one file per artifact, named for the artifact. `directory` is a directory per artifact holding an entry
 * file at a fixed name, which is what lets an artifact ship assets beside the file carrying its frontmatter. `root` is
 * relative to whichever directory the layout describes.
 *
 * Layout is declared rather than compiled in, which is what keeps a path convention from becoming engine vocabulary.
 * One vocabulary serves both directions: a source holds a kind the same two ways a target does, differing in the values
 * rather than in the shape. What differs is what names the artifact -- its slug on the source side, the name it deploys
 * under on the target side.
 */
export const KindLayoutSchema = z
  .discriminatedUnion('form', [
    z.object({ form: z.literal('file'), root: z.string(), extension: z.string() }).meta({ id: 'FileKindLayout' }),
    z
      .object({ form: z.literal('directory'), root: z.string(), entryFile: z.string() })
      .meta({ id: 'DirectoryKindLayout' }),
  ])
  .meta({ id: 'KindLayout' });

export type KindLayout = z.infer<typeof KindLayoutSchema>;
