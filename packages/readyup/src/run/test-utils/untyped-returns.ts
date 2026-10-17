import type { CheckReturnValue, RdyCheck, SkipResult } from '../../kits/types.ts';

/*
 * A kit runs as JavaScript, so its functions return whatever their author wrote and its fields hold
 * whatever they were assigned; neither jiti nor esbuild type-checks any of it. The authoring-error
 * tests exercise exactly the values forbidden by the declared types. The wrappers below restate those
 * values as the types that the declarations promise.
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

/** Wraps a value as a check function that returns it. */
export function returning(value: unknown): RdyCheck['check'] {
  return () => value as CheckReturnValue;
}

/** Wraps a value as a skip function that returns it. */
export function skipReturning(value: unknown): NonNullable<RdyCheck['skip']> {
  return () => value as SkipResult;
}

/* eslint-enable @typescript-eslint/consistent-type-assertions */
