/**
 * Declares selected JSON paths for compile-time inlining.
 *
 * The declaration exists for type-checking in kit source files alone: `pickJsonPlugin` replaces every
 * call with an object literal holding only the requested fields, so reaching this body at runtime
 * means the kit was never compiled.
 */
export function pickJson(_relativePath: string, _paths: Array<string | Array<string>>): Record<string, unknown> {
  throw new Error('pickJson is a compile-time-only function. Compile the kit with `rdy compile` before running it.');
}
