/**
 * Declares selected JSON paths for compile-time inlining.
 *
 * The declaration exists for type-checking in kit source files alone: `rdy compile` and `rdy run --jit` replace
 * every call with an object literal containing only the requested fields, so reaching this body at runtime
 * means the kit was loaded by neither.
 */
export function pickJson(_relativePath: string, _paths: Array<string | Array<string>>): Record<string, unknown> {
  throw new Error(
    'pickJson is resolved when a kit is compiled with `rdy compile` or run from source with `rdy run --jit`. ' +
      'It cannot be called directly.',
  );
}
