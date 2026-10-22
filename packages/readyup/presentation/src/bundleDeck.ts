import path from 'node:path';

import { build, type Plugin } from 'esbuild';

/**
 * The package root, against which esbuild resolves and names every input, so that the bundle is the same on every
 * machine.
 */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** The committed bundle that `index.html` loads. */
export const DECK_BUNDLE_PATH = path.join(PACKAGE_ROOT, 'presentation', 'deck.js');

/** The command that rewrites `DECK_BUNDLE_PATH` from its source. */
export const BUILD_DECK_COMMAND = 'pnpm --filter readyup run build:deck';

/**
 * Returns the deck's script: `deck.ts` and the readyup modules that it imports, as a classic script that assigns its
 * exports to `ReadyupDeck`.
 */
export async function bundleDeck(): Promise<string> {
  const result = await build({
    absWorkingDir: PACKAGE_ROOT,
    bundle: true,
    charset: 'utf8',
    entryPoints: ['presentation/src/deck.ts'],
    format: 'iife',
    globalName: 'ReadyupDeck',
    platform: 'browser',
    plugins: [pinVersion()],
    write: false,
  });

  const [output] = result.outputFiles;
  if (output === undefined) throw new Error('esbuild produced no output for the deck');
  return output.text;
}

// region | Helpers

/**
 * Returns a plugin that replaces readyup's `version.ts`, which reads `package.json` through Node, with a module
 * exporting the version that recorded the captures.
 */
function pinVersion(): Plugin {
  const namespace = 'deck-version';
  return {
    name: 'pin-version',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /\/version\.ts$/ }, (args) =>
        path.resolve(args.resolveDir, args.path) === path.join(PACKAGE_ROOT, 'src', 'version.ts')
          ? { namespace, path: 'version.ts' }
          : undefined,
      );
      pluginBuild.onLoad({ filter: /.*/, namespace }, () => ({
        contents: "export { CAPTURED_READYUP_VERSION as VERSION } from './presentation/src/kits.ts';",
        loader: 'ts',
        resolveDir: PACKAGE_ROOT,
      }));
    },
  };
}

// endregion | Helpers
