import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isRecord } from '../portable/isRecord.ts';
import { VERSION } from '../version.ts';
import { loadEsbuild } from './loadEsbuild.ts';
import { pickJsonPlugin } from './pickJsonPlugin.ts';

/** esbuild target for compiled kits. Matches the Node floor of the `rdy` runner that executes them. */
export const KIT_COMPILE_TARGET = 'es2025';

/**
 * TypeScript settings kits compile under.
 *
 * Supplying this at all is what stops esbuild searching for a `tsconfig.json` above the kit, so a kit's
 * bytes are a function of its own sources rather than of whatever configuration the host repo happens to
 * keep above it. The two settings are the ones esbuild derives rather than fixes; stating them keeps a
 * version bump from moving kit semantics quietly. Everything else stays at esbuild's default.
 *
 * `target` is left undeclared, which is what keeps class-field semantics independent of
 * `KIT_COMPILE_TARGET`: esbuild derives `useDefineForClassFields` from the TypeScript `target`, so
 * declaring one here would tie the two back together.
 */
export const KIT_TSCONFIG = {
  compilerOptions: { experimentalDecorators: false, useDefineForClassFields: true },
};

/** How to obtain esbuild, named wherever its absence is reported so every path prescribes one remedy. */
export const ESBUILD_INSTALL_HINT = 'Install it with: pnpm add --save-dev esbuild';

/**
 * Why an import a kit resolved under the host repo's configuration no longer resolves.
 *
 * esbuild answers an unresolved import by suggesting the path be marked external, which for a kit
 * yields a bundle that fails at run time instead of at compile time. This names the cause its
 * suggestion cannot: `KIT_TSCONFIG` leaves kits with no `paths` aliases to resolve through.
 */
const UNRESOLVED_SPECIFIER_HINT =
  'Kits compile without a tsconfig.json, so tsconfig path aliases do not resolve. Import by relative path or package specifier, and check that any package imported is installed.';

/**
 * Generated-file header prepended to compiled output.
 *
 * Includes an exported `__readyupVersion` constant so the runner can detect skew between the
 * readyup version a kit was compiled against and the runner's own version at execution time. The
 * constant is part of the bundle's bytes, so a kit rebuilt under a different readyup differs from
 * the one on disk even when its source has not moved.
 */
const GENERATED_HEADER = [
  '/** @noformat — @generated. Do not edit. Compiled by rdy. */',
  '/* eslint-disable */',
  `export const __readyupVersion = ${JSON.stringify(VERSION)};`,
  '',
].join('\n');

/**
 * Bundles a TypeScript checklist file into a self-contained ESM bundle and returns its bytes.
 *
 * Node built-in modules and the `readyup` package (including `readyup/*` subpaths) are kept
 * external; all other imports are inlined. The externalized `readyup` specifiers are resolved at
 * runtime by the `rdy` runner's module-resolution hook (`readyupResolverHook.ts`), which routes
 * them to the runner's own readyup installation.
 *
 * The single place the bundler is configured. `compileConfig` writes what this returns and
 * `checkRebuild` compares against it, so the bundle a verification recompiles is the bundle a
 * compile would have produced -- a property that holds by construction rather than by two option
 * objects being kept in agreement.
 *
 * Takes no output path, because none can reach the result: esbuild is invoked without `outfile`, so
 * the bytes are a function of the entry point and the plugin alone.
 */
export async function buildBundle(inputPath: string): Promise<Buffer> {
  const resolvedInput = path.resolve(inputPath);

  let esbuild: typeof import('esbuild');
  try {
    esbuild = await loadEsbuild();
  } catch (error: unknown) {
    throw new Error(`esbuild is required to compile kits but is not installed. ${ESBUILD_INSTALL_HINT}`, {
      cause: error,
    });
  }

  let result;
  try {
    result = await esbuild.build({
      entryPoints: [resolvedInput],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: KIT_COMPILE_TARGET,
      tsconfigRaw: KIT_TSCONFIG,
      external: ['node:*', 'readyup', 'readyup/*'],
      plugins: [pickJsonPlugin()],
      banner: { js: GENERATED_HEADER },
      write: false,
    });
  } catch (error: unknown) {
    if (!hasUnresolvedSpecifier(error)) throw error;
    throw new Error(`${describeError(error)}\n\n${UNRESOLVED_SPECIFIER_HINT}`, { cause: error });
  }

  const outputFile = result.outputFiles[0];
  if (outputFile === undefined) {
    throw new Error(`esbuild produced no output for ${resolvedInput}`);
  }

  return Buffer.from(outputFile.contents);
}

// region | Helpers

/**
 * Reports whether an esbuild failure carries an import esbuild could not resolve.
 *
 * Reads the failure's own error list rather than its rendered message, and matches on message text
 * because esbuild leaves the machine-readable `id` empty on a resolve error.
 */
function hasUnresolvedSpecifier(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const errors = error['errors'];
  return (
    Array.isArray(errors) &&
    errors.some(
      (message: unknown) =>
        isRecord(message) && typeof message['text'] === 'string' && message['text'].startsWith('Could not resolve '),
    )
  );
}

// endregion | Helpers
