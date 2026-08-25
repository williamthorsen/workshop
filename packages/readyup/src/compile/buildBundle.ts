import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isRecord } from '../portable/isRecord.ts';
import { hashFile } from '../verify/targetHash.ts';
import { VERSION } from '../version.ts';
import type { CompiledInput } from './CompiledInput.ts';
import { identifyInput } from './CompiledInput.ts';
import { createCompileRecorder } from './createCompileRecorder.ts';
import { loadEsbuild } from './loadEsbuild.ts';
import { pickJsonPlugin } from './pickJsonPlugin.ts';
import { resolveCompileRoot } from './resolveCompileRoot.ts';

/**
 * Directory whose contents stay out of a kit's recorded closure.
 *
 * Dependency contents are pinned by the lockfile and read exactly by `rdy verify --rebuild`, while
 * recording them would size a committed, per-compile-rewritten manifest to the dependency tree rather
 * than to the kit: one `import zod` inlines 79 files.
 */
const EXCLUDED_DIRECTORY = 'node_modules';

/** esbuild target for compiled kits. Matches the Node floor of the `rdy` runner that executes them. */
export const KIT_COMPILE_TARGET = 'es2025';

/**
 * TypeScript settings kits compile under.
 *
 * Supplying this at all is what stops esbuild searching for a `tsconfig.json` above the kit, so a kit compiles
 * from its own sources rather than from whatever configuration the host repo happens to keep above it. The two
 * settings are the ones esbuild derives rather than fixes; stating them keeps a version bump from moving kit
 * semantics quietly. Everything else stays at esbuild's default.
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
 * esbuild responds to an unresolved import by suggesting the path be marked external, which for a kit
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
 * constant is part of the bundle, so a kit rebuilt under a different readyup differs from the one on
 * disk even when its source has not moved.
 */
const GENERATED_HEADER = [
  '/** @noformat -- @generated. Do not edit. Compiled by rdy. */',
  '/* eslint-disable */',
  `export const __readyupVersion = ${JSON.stringify(VERSION)};`,
  '',
].join('\n');

/** A kit's compiled bundle and the closure of files the compile read to produce it. */
export interface BundleResult {
  /** Every package the bundle inlined, by name, with the version its `package.json` declares. */
  bundledDependencies: Record<string, string>;

  bytes: Buffer;

  /** The esbuild that produced the bundle. */
  esbuildVersion: string;

  /** Every file read outside `node_modules`, with absolute paths, sorted by path and then by kind. */
  inputs: CompiledInput[];
}

/**
 * Bundles a TypeScript checklist file into a self-contained ESM bundle and returns it.
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
 * Takes no output path, because none can reach the result: esbuild is invoked without `outfile`. The bundle
 * is determined by the entry point and the plugin. esbuild renders each bundled module's path into the
 * output against the working directory, which `resolveCompileRoot` derives from the kit itself, so the
 * directory the compile was invoked from does not reach the bundle.
 *
 * The one place a compile's input closure is known, which is why it returns the closure alongside the
 * bundle rather than leaving a later reader to reconstruct it.
 */
export async function buildBundle(inputPath: string): Promise<BundleResult> {
  const resolvedInput = path.resolve(inputPath);
  const workingDir = resolveCompileRoot(resolvedInput);

  let esbuild: typeof import('esbuild');
  try {
    esbuild = await loadEsbuild();
  } catch (error: unknown) {
    throw new Error(`esbuild is required to compile kits but is not installed. ${ESBUILD_INSTALL_HINT}`, {
      cause: error,
    });
  }

  const recorder = createCompileRecorder();

  let result;
  try {
    result = await esbuild.build({
      entryPoints: [resolvedInput],
      absWorkingDir: workingDir,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: KIT_COMPILE_TARGET,
      tsconfigRaw: KIT_TSCONFIG,
      external: ['node:*', 'readyup', 'readyup/*'],
      plugins: [pickJsonPlugin(recorder)],
      banner: { js: GENERATED_HEADER },
      metafile: true,
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

  const metafileKeys = Object.keys(result.metafile.inputs);

  return {
    bundledDependencies: collectBundledDependencies(metafileKeys, workingDir),
    bytes: Buffer.from(outputFile.contents),
    esbuildVersion: esbuild.version,
    inputs: collectInputs(recorder.inputs, metafileKeys, workingDir),
  };
}

// region | Helpers

/**
 * Returns the packages the bundle inlined, by name, from the metafile inputs the closure excludes.
 *
 * A tree can hold two versions of one package at once, and a bundle can inline both, so a name's value
 * is every bundled version, sorted and comma-separated. A file whose package cannot be identified
 * contributes nothing: the same derivation runs at compile time and at rebuild time, so an
 * unidentifiable package cancels out of the comparison rather than producing a spurious difference.
 */
function collectBundledDependencies(metafileKeys: string[], workingDir: string): Record<string, string> {
  const versionsByName = new Map<string, Set<string>>();
  for (const key of metafileKeys) {
    const resolvedPath = path.resolve(workingDir, key);
    if (!isDependencyFile(resolvedPath)) continue;
    const identity = identifyPackage(path.dirname(resolvedPath));
    if (identity === undefined) continue;
    const versions = versionsByName.get(identity.name) ?? new Set<string>();
    versions.add(identity.version);
    versionsByName.set(identity.name, versions);
  }

  return Object.fromEntries(
    versionsByName
      .entries()
      .toArray()
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([name, versions]) => [name, versions.values().toArray().toSorted().join(', ')]),
  );
}

/**
 * Returns the closure of a compile, merging what the recorder read with what esbuild resolved.
 *
 * A recorded read wins over the metafile's account of the same file, because only the recorder knows an
 * inline input's path specifier. The metafile keys are relative to the working directory esbuild ran
 * under, which is the kit's own compile root rather than the invocation's, so resolving them cannot drift.
 *
 * Sorted so that recompiling a kit whose inputs have not moved rewrites the manifest identically.
 */
function collectInputs(recorded: CompiledInput[], metafileKeys: string[], workingDir: string): CompiledInput[] {
  const byIdentity = new Map<string, CompiledInput>();
  for (const input of recorded) {
    if (isDependencyFile(input.path)) continue;
    byIdentity.set(identifyInput(input.kind, input.path), input);
  }

  for (const key of metafileKeys) {
    const resolvedPath = path.resolve(workingDir, key);
    // Excluded before the hash, so a dependency tree is never read from disk: one `import zod` inlines 79 files.
    if (isDependencyFile(resolvedPath)) continue;
    const identity = identifyInput('module', resolvedPath);
    if (byIdentity.has(identity)) continue;
    byIdentity.set(identity, { hash: hashFile(resolvedPath), kind: 'module', path: resolvedPath });
  }

  return byIdentity
    .values()
    .toArray()
    .toSorted((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}

/**
 * Reports whether an esbuild failure names an import esbuild could not resolve.
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

/**
 * Returns the name and version of the package holding `directory`, walking up to the nearest
 * `package.json` that declares both.
 *
 * The walk never leaves `node_modules`: a store path with no identifiable package returns nothing
 * rather than climbing on and attributing the file to the host project.
 */
function identifyPackage(directory: string): { name: string; version: string } | undefined {
  for (let current = directory; isDependencyFile(current); current = path.dirname(current)) {
    const manifestPath = path.join(current, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const identity = readPackageIdentity(manifestPath);
    if (identity !== undefined) return identity;
  }
  return undefined;
}

/** Reports whether a path lies under a dependency directory, whose contents the closure does not record. */
function isDependencyFile(filePath: string): boolean {
  return filePath.split(path.sep).includes(EXCLUDED_DIRECTORY);
}

/** Returns a package.json's name and version, or nothing when the file does not declare both readably. */
function readPackageIdentity(manifestPath: string): { name: string; version: string } | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return undefined;
  }

  if (!isRecord(parsed) || typeof parsed['name'] !== 'string' || typeof parsed['version'] !== 'string') {
    return undefined;
  }
  return { name: parsed['name'], version: parsed['version'] };
}

// endregion | Helpers
