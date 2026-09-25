import { z } from 'zod';

import { ErrorBodySchema } from './common.ts';

/**
 * Version of the error-envelope payload.
 *
 * Bumped when a field is removed, renamed, or re-typed -- never when an optional field is added.
 */
export const SCHEMA_VERSION = 1;

/**
 * The single JSON document that rdy writes to stdout when an invocation fails before it can produce anything else.
 *
 * The envelope covers failures that precede dispatch. Once a run has reached its kits, a kit that fails
 * becomes an entry inside the report rather than replacing it. The exception is a failure that nothing
 * awaits, which ends the run with an `internal` envelope after some kits may have run.
 */
export const ErrorEnvelopeSchema = z
  .object({
    schemaVersion: z.int().min(1),
    error: ErrorBodySchema,
  })
  .meta({ id: 'ErrorEnvelope' });

export type JsonErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
