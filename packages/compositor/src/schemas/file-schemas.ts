/** Files: rendered output, ownership, and content. */

import { z } from 'zod';

import { DiffStatusSchema, HashSchema, IdSchema } from './common.ts';

/**
 * One file body, addressed by its hash.
 *
 * `base64` carries a file the engine copies byte for byte, such as an image or a script beside a text artifact, whose
 * bytes do not survive a round trip through a UTF-8 string.
 */
export const BlobSchema = z
  .object({
    encoding: z.enum(['base64', 'utf8']),
    data: z.string(),
  })
  .meta({ id: 'Blob' });

/**
 * How much of a file the engine owns.
 *
 * `full` is a file the engine writes whole. `region` is a fenced block inside a file the engine does not otherwise own,
 * located by its marker pair. `entries` is ownership of individual items within a structured document, interleaved with
 * items other tools write, where no fence can delimit the boundary and a sentinel identifies each owned item.
 */
export const FileOwnershipSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('full') }).meta({ id: 'FullOwnership' }),
    z.object({ kind: z.literal('region'), open: z.string(), close: z.string() }).meta({ id: 'RegionOwnership' }),
    z
      .object({ kind: z.literal('entries'), sentinel: z.string(), format: z.enum(['json', 'yaml']) })
      .meta({ id: 'EntriesOwnership' }),
  ])
  .meta({ id: 'FileOwnership' });

/**
 * One artifact's contribution to a file.
 *
 * `marker` delimits the artifact's own block where several artifacts aggregate into one region, which is what makes a
 * single contributor's bytes locatable within the whole. A file carrying one artifact's content has no inner marker.
 */
export const ArtifactContributionSchema = z
  .object({
    artifactId: IdSchema,
    marker: z.object({ open: z.string(), close: z.string() }).optional(),
  })
  .meta({ id: 'ArtifactContribution' });

/**
 * Everything whose content reaches a file.
 *
 * Both lists are empty for a file the engine generates from no source content.
 */
export const FileContributorsSchema = z
  .object({
    artifacts: z.array(ArtifactContributionSchema),
    partials: z.array(IdSchema),
  })
  .meta({ id: 'FileContributors' });

/** One side of a file's diff, naming the blob that holds its body. */
export const FileSideSchema = z.object({ hash: HashSchema }).meta({ id: 'FileSide' });

/** Why apply will not write a file it otherwise planned. */
export const FileBlockSchema = z.object({ reason: z.string() }).meta({ id: 'FileBlock' });

/**
 * One file in a target's rendered output.
 *
 * `targetId` and `path` together identify the file; `path` is relative to the target's root, with POSIX separators.
 * `current` is absent for a file that does not yet exist and `planned` for one that will be removed, so a file's status
 * follows from which sides are present and whether their hashes match.
 *
 * `blocked` sits beside `status` and does not replace it: a file apply will skip still has a diff worth showing, and
 * the four-value status vocabulary stays a statement about content alone.
 */
export const FileEntrySchema = z
  .object({
    targetId: IdSchema,
    path: z.string(),
    status: DiffStatusSchema,
    ownership: FileOwnershipSchema,
    blocked: FileBlockSchema.optional(),
    current: FileSideSchema.optional(),
    planned: FileSideSchema.optional(),
    contributors: FileContributorsSchema,
  })
  .meta({ id: 'FileEntry' });

export type ArtifactContribution = z.infer<typeof ArtifactContributionSchema>;
export type Blob = z.infer<typeof BlobSchema>;
export type FileBlock = z.infer<typeof FileBlockSchema>;
export type FileContributors = z.infer<typeof FileContributorsSchema>;
export type FileEntry = z.infer<typeof FileEntrySchema>;
export type FileOwnership = z.infer<typeof FileOwnershipSchema>;
export type FileSide = z.infer<typeof FileSideSchema>;
