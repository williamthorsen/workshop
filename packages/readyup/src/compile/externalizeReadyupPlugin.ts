import type { Plugin } from 'esbuild';

/** Matches the `readyup` package and every `readyup/*` subpath, and nothing whose name merely starts with it. */
const READYUP_SPECIFIER_RE = /^readyup(\/|$)/;

/**
 * Returns an esbuild plugin that keeps `readyup` imports out of the bundle and declares them side-effect free.
 *
 * Externalizing through `onResolve` rather than through the `external` option is what preserves
 * tree-shaking: esbuild assumes a specifier named in `external` may have side effects and retains its
 * import even after removing the only consumer, which leaves a dead import in committed output.
 * `sideEffects: false` supplies the knowledge that esbuild cannot infer for a module it never reads.
 * It holds for every specifier this matches: the one file readyup's own `sideEffects` names is a `bin`
 * entry rather than an `exports` entry, so no import that a kit can write reaches it.
 *
 * The externalized specifiers are resolved at runtime by the `rdy` runner's module-resolution hook
 * (`readyupResolverHook.ts`), which routes them to the runner's own readyup installation.
 */
export function externalizeReadyupPlugin(): Plugin {
  return {
    name: 'externalize-readyup',
    setup(build) {
      build.onResolve({ filter: READYUP_SPECIFIER_RE }, (args) => ({
        path: args.path,
        external: true,
        sideEffects: false,
      }));
    },
  };
}
