/**
 * Node module-customization hook that intercepts `readyup` and `readyup/*` import
 * specifiers and rewrites their `parentURL` to point inside the runner's own
 * readyup installation, and that loads every kit imported with the kit marker as
 * an ES module.
 *
 * `src/bin/rdy.ts` calls `initialize()` and registers `resolve` and `load` with
 * `module.registerHooks()` before any kit is loaded.
 * Compiled kits leave `readyup` imports as live specifiers (see `compileConfig.ts`
 * external list); this hook ensures those specifiers resolve to the runner's
 * installation regardless of where the kit file lives on disk -- making
 * `npx readyup` and `rdy run --from ...` work without requiring readyup as a
 * project dependency.
 *
 * A kit is an ES module in a `.js` file, which Node would otherwise load in the
 * format declared by the `package.json` nearest to it; forcing the format lets a
 * kit load in a CommonJS or typeless project.
 *
 * The resolver is intentionally narrow: Only `readyup` and `readyup/<subpath>` are
 * intercepted. All other specifiers pass through unchanged. If a third bare
 * specifier ever needs interception, design that case explicitly rather than
 * generalizing this hook.
 */

import type {
  LoadFnOutput,
  LoadHookContext,
  LoadHookSync,
  ResolveFnOutput,
  ResolveHookContext,
  ResolveHookSync,
} from 'node:module';

/** Data passed to `initialize()`. */
export interface ReadyupResolverHookData {
  /** URL of a file inside the runner's readyup installation. Node walks `node_modules` up from here. */
  readyupParentURL: string;
}

type NextLoad = Parameters<LoadHookSync>[2];

type NextResolve = Parameters<ResolveHookSync>[2];

/**
 * Query parameter that marks an import as a kit. It repeats `KIT_IMPORT_PARAM` from `kits/importKitModule.ts`,
 * because this module loads on its own as a hook file and has no runtime imports.
 */
const KIT_IMPORT_PARAM = 'rdy-kit';

let readyupParentURL: string | undefined;

/** Reports whether a URL carries the kit marker. */
function isKitImport(url: string): boolean {
  return URL.canParse(url) && new URL(url).searchParams.has(KIT_IMPORT_PARAM);
}

/** Reports whether a specifier should resolve against the runner's readyup installation. */
function isReadyupSpecifier(specifier: string): boolean {
  return specifier === 'readyup' || specifier.startsWith('readyup/');
}

/** Initializes the hook with the runner's readyup location, which happens exactly once. */
export function initialize(data: ReadyupResolverHookData): void {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- the runner supplies this once.
  readyupParentURL = data.readyupParentURL;
}

/** Loads a URL marked as a kit import as an ES module, and delegates every other URL to the default loader unchanged. */
export function load(url: string, context: LoadHookContext, nextLoad: NextLoad): LoadFnOutput {
  if (isKitImport(url)) return nextLoad(url, { ...context, format: 'module' });
  return nextLoad(url, context);
}

/**
 * Resolves `readyup` and `readyup/*` specifiers against the runner's own readyup installation by
 * rewriting `parentURL`, and delegates every other specifier to the default resolver unchanged.
 *
 * A readyup specifier resolved before `initialize()` throws: Falling back to the original
 * `parentURL` would defeat the rewrite and appear later as an opaque `ERR_MODULE_NOT_FOUND`.
 */
export function resolve(specifier: string, context: ResolveHookContext, nextResolve: NextResolve): ResolveFnOutput {
  if (isReadyupSpecifier(specifier)) {
    if (readyupParentURL === undefined) {
      throw new Error(
        `readyupResolverHook: initialize() was not called before resolve(); hook was registered without the required readyupParentURL data (specifier: "${specifier}")`,
      );
    }
    return nextResolve(specifier, { ...context, parentURL: readyupParentURL });
  }
  return nextResolve(specifier, context);
}
