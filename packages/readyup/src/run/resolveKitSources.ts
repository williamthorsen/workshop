import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors/candidate';

import { usageError } from '../errors/RdyError.ts';
import { buildKitFilename } from '../kits/buildKitFilename.ts';
import { KITS_DIR } from '../kits/kitsDir.ts';
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

  // Assume `jit` is always false when `fromValue` is present; `parseRunArgs` enforces this constraint.
  const extension = jit ? '.ts' : '.js';

  // Fill the default before the `--packages` branch reads it, so a bare invocation is structurally
  // `--packages default` and the two forms cannot select different kits.
  const declaredSpecs = kitSpecifiers.length > 0 ? kitSpecifiers : [{ kitName: DEFAULT_KIT_NAME, checklists: [] }];

  if (packages === true) {
    const requestedNames = declaredSpecs.map((spec) => spec.kitName);
    return resolveConfiguredPackages(configuredPackages ?? [], requestedNames, extension);
  }

  // `--checklists` names checklists within one kit, and `parseRunArgs` has already rejected every
  // invocation where "one kit" is ambiguous, so this map never covers more than a single spec.
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

  // Default/internal case: resolve from the current repo.
  if (internal) {
    return specs.map((spec) => ({
      name: spec.kitName,
      source: {
        path: path.join(KITS_DIR, internalDir ?? '.', buildKitFilename(spec.kitName, internalInfix, extension)),
      },
      checklists: spec.checklists,
    }));
  }

  return specs.map((spec) => ({
    name: spec.kitName,
    source: { path: path.join(KITS_DIR, `${spec.kitName}${extension}`) },
    checklists: spec.checklists,
  }));
}

// region | Helpers

/**
 * Splits a kit URL into the kit's name and the label naming where it was fetched from.
 *
 * The scheme is dropped from the label because every kit URL carries one and it distinguishes nothing.
 * A URL that does not parse is reported exactly as given, since a value the runner could not read is one
 * the reader needs to see unaltered.
 */
function describeUrlSource(urlValue: string): { label: string; name: string } {
  if (!URL.canParse(urlValue)) return { label: urlValue, name: urlValue };

  const { host, pathname } = new URL(urlValue);
  return { label: `${host}${pathname}`, name: path.basename(pathname, path.extname(pathname)) };
}

// endregion | Helpers
