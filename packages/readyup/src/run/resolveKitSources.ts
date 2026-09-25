import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { usageError } from '../errors/RdyError.ts';
import { buildKitFilename } from '../kits/buildKitFilename.ts';
import { type CompileDirectories, resolveKitRoot } from '../kits/kitsDir.ts';
import { type FromSource, parseFromValue } from '../kits/parseFromValue.ts';
import { DEFAULT_KIT_NAME } from './defaultKitName.ts';
import type { KitSpecifier } from './parseKitSpecifiers.ts';
import { resolveConfiguredPackages } from './resolveConfiguredPackages.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';
import { resolveFromSource } from './resolveFromSource.ts';

/** Resolves parsed flags into an array of kit entries to execute. */
export function resolveKitSources({
  filePath,
  fromValue,
  urlValue,
  kitSpecifiers,
  checklists,
  jit,
  internal,
  internalDir,
  internalInfix,
  packages,
  configuredPackages,
  compile,
}: {
  filePath: string | undefined;
  fromValue: string | undefined;
  urlValue: string | undefined;
  kitSpecifiers: KitSpecifier[];
  checklists: string[] | undefined;
  jit: boolean;
  internal: boolean;
  internalDir?: string | undefined;
  internalInfix?: string | undefined;
  packages?: boolean;
  configuredPackages?: string[] | undefined;
  /** The config's compile directories; absent when no config was loaded, which is the external-source path. */
  compile?: CompileDirectories | undefined;
}): ResolvedKitEntry[] {
  if (filePath !== undefined) {
    return [
      {
        name: path.basename(filePath, path.extname(filePath)),
        source: { path: filePath },
        checklists: checklists ?? [],
        provenance: { kind: 'directory', label: path.dirname(filePath) },
      },
    ];
  }
  if (urlValue !== undefined) {
    const { label, name } = describeUrlSource(urlValue);
    return [{ name, source: { url: urlValue }, checklists: checklists ?? [], provenance: { kind: 'remote', label } }];
  }

  // Assume `jit` is always `false` when `fromValue` is present; `parseRunArgs` enforces this constraint.
  const extension = jit ? '.ts' : '.js';

  // Fill the default before the `--packages` branch reads it, so that a bare invocation is structurally
  // `--packages default` and the two forms cannot select different kits.
  const declaredSpecs = kitSpecifiers.length > 0 ? kitSpecifiers : [{ kitName: DEFAULT_KIT_NAME, checklists: [] }];

  if (packages === true) {
    const requestedNames = declaredSpecs.map((spec) => spec.kitName);
    return resolveConfiguredPackages(configuredPackages ?? [], requestedNames, extension);
  }

  // `--checklists` names checklists within one kit, and `parseRunArgs` has already rejected every
  // invocation in which "one kit" is ambiguous, so this map never covers more than a single spec.
  const specs = checklists === undefined ? declaredSpecs : declaredSpecs.map((spec) => ({ ...spec, checklists }));

  if (fromValue !== undefined) {
    let source: FromSource;
    try {
      source = parseFromValue(fromValue);
    } catch (error: unknown) {
      throw usageError(describeError(error), { cause: error });
    }
    return resolveFromSource(source, specs, extension);
  }

  // Default/internal case: Resolve from the current repo.
  const root = resolveKitRoot(compile, jit);

  if (internal) {
    return specs.map((spec) => ({
      name: spec.kitName,
      source: {
        path: path.join(root, internalDir ?? '.', buildKitFilename(spec.kitName, internalInfix, extension)),
      },
      checklists: spec.checklists,
    }));
  }

  return specs.map((spec) => ({
    name: spec.kitName,
    source: { path: path.join(root, `${spec.kitName}${extension}`) },
    checklists: spec.checklists,
  }));
}

// region | Helpers

/**
 * Splits a kit URL into the kit's name and the label naming where it was fetched from.
 *
 * The scheme is dropped from the label because every kit URL has one and it distinguishes nothing.
 * A URL that does not parse is reported exactly as given, since a value that the runner could not read
 * must be shown to the reader unaltered.
 */
function describeUrlSource(urlValue: string): { label: string; name: string } {
  if (!URL.canParse(urlValue)) return { label: urlValue, name: urlValue };

  const { host, pathname } = new URL(urlValue);
  return { label: `${host}${pathname}`, name: path.basename(pathname, path.extname(pathname)) };
}

// endregion | Helpers
