import type { z } from 'zod';

/**
 * The path of each validation issue `value` raises against `schema`, or `undefined` when it validates.
 *
 * Asserting on paths pins a rejection to the field that caused it, so a test cannot pass because some unrelated part of
 * the fixture happened to be malformed.
 */
export function findIssuePaths(schema: z.ZodType, value: unknown): Array<ReadonlyArray<PropertyKey>> | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues.map((issue) => issue.path);
}
