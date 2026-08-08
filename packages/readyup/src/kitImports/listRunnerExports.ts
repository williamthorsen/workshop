import * as checkUtilsNamespace from '../check-utils/index.ts';
import * as rootNamespace from '../index.ts';
import * as resolverHookNamespace from '../readyupResolverHook.ts';

/**
 * What the running readyup exports, keyed by the specifier a kit reaches it through.
 *
 * Read from the runner's own entry points rather than from a maintained list, so the table cannot drift from the
 * package it describes. Each entry point is a barrel named in the package's `exports` map, and loading every module it
 * touches is the point: the whole surface is what a kit binds against.
 *
 * Type-only exports are absent, correctly: esbuild erases type imports, so no bundle can bind one.
 */
const RUNNER_EXPORTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['readyup', new Set(Object.keys(rootNamespace))],
  ['readyup/check-utils', new Set(Object.keys(checkUtilsNamespace))],
  ['readyup/readyupResolverHook', new Set(Object.keys(resolverHookNamespace))],
]);

/** Returns the names a `readyup` specifier exports, or undefined where the runner publishes no such subpath. */
export function listRunnerExports(specifier: string): ReadonlySet<string> | undefined {
  return RUNNER_EXPORTS.get(specifier);
}

/** Lists every `readyup` specifier whose exports the runner can account for. */
export function listRunnerSpecifiers(): string[] {
  return [...RUNNER_EXPORTS.keys()];
}
