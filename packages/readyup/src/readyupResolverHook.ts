/**
 * Node module-customization hook that intercepts `readyup` and `readyup/*` import
 * specifiers and rewrites their `parentURL` to point inside the runner's own
 * readyup installation.
 *
 * Registered by `src/bin/rdy.ts` via `module.register()` before any kit is loaded.
 * Compiled kits leave `readyup` imports as live specifiers (see `compileConfig.ts`
 * external list); this hook ensures those specifiers resolve to the runner's
 * installation regardless of where the kit file lives on disk — making
 * `npx readyup` and `rdy run --from ...` work without requiring readyup as a
 * project dependency.
 *
 * The hook is intentionally narrow: only `readyup` and `readyup/<subpath>` are
 * intercepted. All other specifiers pass through unchanged. If a third bare
 * specifier ever needs interception, design that case explicitly rather than
 * generalizing this hook.
 */

/** Data passed from `module.register()` to `initialize()`. */
export interface ReadyupResolverHookData {
  /** URL of a file inside the runner's readyup installation. Node walks `node_modules` up from here. */
  readyupParentURL: string;
}

/** Context object passed to the `resolve` hook by Node's module customization API. */
interface ResolveContext {
  conditions: string[];
  importAttributes: Record<string, string>;
  parentURL: string | undefined;
}

/** Output object returned by the `resolve` hook (and `nextResolve`). */
interface ResolveOutput {
  format?: string | null | undefined;
  importAttributes?: Record<string, string> | undefined;
  shortCircuit?: boolean | undefined;
  url: string;
}

type NextResolve = (specifier: string, context?: Partial<ResolveContext>) => ResolveOutput | Promise<ResolveOutput>;

let readyupParentURL: string | undefined;

/** Reports whether a specifier should be routed through the runner's readyup installation. */
function isReadyupSpecifier(specifier: string): boolean {
  return specifier === 'readyup' || specifier.startsWith('readyup/');
}

/**
 * Initializes the hook with the data `module.register()` supplies, which happens exactly once.
 */
export function initialize(data: ReadyupResolverHookData): void {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- `module.register()` supplies this once.
  readyupParentURL = data.readyupParentURL;
}

/**
 * Routes `readyup` and `readyup/*` specifiers through the runner's own readyup installation by
 * rewriting `parentURL`, and delegates every other specifier to the default resolver unchanged.
 *
 * A readyup specifier arriving before `initialize()` throws: falling back to the original
 * `parentURL` would defeat the rewrite and surface later as an opaque `ERR_MODULE_NOT_FOUND`.
 */
export function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
): ResolveOutput | Promise<ResolveOutput> {
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
