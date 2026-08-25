/** Artifact resolution: which source an artifact came from, and which sources lost it to that one. */

import { z } from 'zod';

import { HashSchema, IdSchema } from './scalar-schemas.ts';

/** One source that contains an artifact, whether or not it won resolution. */
export const ResolutionCandidateSchema = z
  .object({
    sourceId: IdSchema,
    path: z.string(),
    hash: HashSchema,
  })
  .meta({ id: 'ResolutionCandidate' });

/**
 * Which source an artifact resolved from, and which lost.
 *
 * `shadowed` holds losers only, in precedence order, so an artifact exactly one source contains has an empty array.
 */
export const ArtifactResolutionSchema = z
  .object({
    winner: ResolutionCandidateSchema,
    shadowed: z.array(ResolutionCandidateSchema),
  })
  .meta({ id: 'ArtifactResolution' });

export type ArtifactResolution = z.infer<typeof ArtifactResolutionSchema>;
export type ResolutionCandidate = z.infer<typeof ResolutionCandidateSchema>;
