/**
 * Declare selected JSON paths for compile-time inlining.
 *
 * This function exists only for type-checking in kit source files. At compile time, the
 * `pickJsonPlugin` replaces every call with an object literal containing only the requested
 * fields. If this function executes at runtime, it means the kit was not compiled.
 */
export function pickJson(_relativePath: string, _paths: Array<string | Array<string>>): Record<string, unknown> {
  throw new Error('pickJson is a compile-time-only function. Compile the kit with `rdy compile` before running it.');
}
