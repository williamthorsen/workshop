import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { configError, kitLoadError, usageError } from '../errors/RdyError.ts';
import { KITS_DIR } from '../kits/kitsDir.ts';
import { type FromSource, parseFromValue } from '../kits/parseFromValue.ts';
import { collectCompiledKits } from '../list/collectCompiledKits.ts';
import { collectSourceKits } from '../list/collectSourceKits.ts';
import { enumerateKits } from '../list/enumerateKits.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { resolveConfiguredPackages } from './resolveConfiguredPackages.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { resolveKitSources } from './resolveKitSources.ts';

interface ResolveAllKitSourcesOptions {
  /** The config's `compile.outDir`; absent where no config was loaded. */
  compileOutDir?: string | undefined;
  configuredPackages?: string[] | undefined;
  fromValue: string | undefined;
  internal: boolean;
  internalDir?: string | undefined;
  internalInfix?: string | undefined;
  jit: boolean;
  packages: boolean;
  remote: RemoteFetchContext;
}

/**
 * Resolves `--all` into an entry for every kit that the source selected by the other flags holds.
 *
 * A source reached by kit name is enumerated and then resolved by `resolveKitSources`, so each entry is the one
 * that naming the kit would produce. The project's compiled kits are resolved from the paths that its listing
 * reports instead, which is what reaches a relocated `compile.outDir`.
 *
 * A source holding no kits is a kit-load error: A run that passes with no kits hides a missing compile or a
 * run from the wrong directory.
 */
export async function resolveAllKitSources(options: ResolveAllKitSourcesOptions): Promise<ResolvedKitEntry[]> {
  const { fromValue, internal, jit, packages } = options;
  const extension = jit ? '.ts' : '.js';

  // A configured package publishing no kits is already a config error, so this selection is never empty.
  if (packages) {
    return resolveConfiguredPackages(options.configuredPackages ?? [], 'all', extension);
  }

  if (fromValue !== undefined) {
    const sourceKits = await collectSourceKits(parseFromArgument(fromValue), options.remote);
    const names = sourceKits.kits.map((kit) => kit.name);
    return resolveNamedKits(options, names, `--all found no kits in ${fromValue}.`);
  }

  if (internal) {
    const dir = path.join(KITS_DIR, options.internalDir ?? '.');
    const internalExtension = options.internalInfix === undefined ? extension : `.${options.internalInfix}${extension}`;
    const names = readKitNames(dir, internalExtension);
    return resolveNamedKits(options, names, `--all found no *${internalExtension} kits in ${dir}.`);
  }

  if (jit) {
    const names = readKitNames(KITS_DIR, extension);
    return resolveNamedKits(options, names, `--all found no *${extension} kits in ${KITS_DIR}.`);
  }

  return resolveCompiledKits(path.resolve(options.compileOutDir ?? KITS_DIR));
}

// region | Helpers

/** Parses a `--from` value, reporting a malformed one as the usage error that a named run reports. */
function parseFromArgument(fromValue: string): FromSource {
  try {
    return parseFromValue(fromValue);
  } catch (error: unknown) {
    throw usageError(describeError(error), { cause: error });
  }
}

/** Returns the sorted kit names in a directory, reporting a directory that cannot be read as a config error. */
function readKitNames(dir: string, extension: string): string[] {
  try {
    return enumerateKits({ dir, extension });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }
}

/** Resolves the project's compiled kits from the paths that its listing reports. */
function resolveCompiledKits(outDir: string): ResolvedKitEntry[] {
  let rows;
  try {
    rows = collectCompiledKits({
      manifestPath: path.resolve(DEFAULT_MANIFEST_PATH),
      // The run's `manifest-unreadable` advisory reports this same file.
      onUnreadableManifest: () => {},
      outDir,
    });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }

  if (rows.length === 0) {
    throw kitLoadError(`--all found no compiled kits in ${path.relative(process.cwd(), outDir) || '.'}.`, {
      hint: 'Run `rdy compile` to build them, or add --jit to run the TypeScript sources.',
    });
  }

  return rows.map((row) => ({
    name: row.name,
    source: { path: row.path ?? path.relative(process.cwd(), path.join(outDir, `${row.name}.js`)) },
    checklists: [],
  }));
}

/** Resolves enumerated kit names as a named invocation with the same flags would, failing when there are none. */
function resolveNamedKits(
  options: ResolveAllKitSourcesOptions,
  names: string[],
  emptyMessage: string,
): ResolvedKitEntry[] {
  // `resolveKitSources` reads an empty selection as the default kit, so emptiness is settled here.
  if (names.length === 0) {
    throw kitLoadError(emptyMessage);
  }

  return resolveKitSources({
    checklists: undefined,
    filePath: undefined,
    fromValue: options.fromValue,
    internal: options.internal,
    internalDir: options.internalDir,
    internalInfix: options.internalInfix,
    jit: options.jit,
    kitSpecifiers: names.map((kitName) => ({ kitName, checklists: [] })),
    urlValue: undefined,
  });
}

// endregion | Helpers
