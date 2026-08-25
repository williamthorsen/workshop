import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { BundleResult } from '../compile/buildBundle.ts';
import { buildBundle } from '../compile/buildBundle.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { VERSION } from '../version.ts';
import { hashBytes } from './targetHash.ts';

/** Outcome of a per-kit rebuild check. */
export type RebuildStatus =
  | { kind: 'ok' }
  | {
      kind: 'mismatch';
      expected: string;
      actual: string;
      compiledWith?: string;
      dependencyChanges?: DependencyChange[];
      esbuild?: EsbuildComparison;
    }
  | { kind: 'failed'; message: string }
  | { kind: 'missing'; reason: string };

/**
 * A bundled package whose recorded version the rebuild does not reproduce.
 *
 * A side is absent where the package was not bundled then or now.
 */
export interface DependencyChange {
  name: string;
  recorded?: string;
  rebuilt?: string;
}

/** The esbuild recorded at compile time against the one the rebuild ran. */
export interface EsbuildComparison {
  recorded: string;
  rebuilt: string;
}

/**
 * Determines whether recompiling a kit's source reproduces the compiled bundle on disk.
 *
 * Answers exactly the question the hash verdicts approximate. The recorded hashes cover what the
 * compile read outside `node_modules`, but a bundle is also a function of every dependency module it
 * inlines, the esbuild version, and the compile options. Recompiling reads all of them, and a
 * mismatch compares the entry's recorded `esbuildVersion` and `bundledDependencies` against the
 * rebuild's own record to name which versions changed.
 *
 * Compares against the bundle on disk and never against `targetHash`, so the verdict is independent
 * of the manifest's bookkeeping and can contradict it. A kit whose recorded hash has gone wrong
 * reports drift and a passing rebuild together, which is how the two verdicts distinguish a corrupt
 * bundle from corrupt bookkeeping.
 *
 * Every way the check can fail to reach an answer is reported rather than waved through: `missing`
 * when an input is absent, `failed` when the source no longer compiles. `failed` is distinct from
 * `mismatch` because the remedy differs -- fix the kit, versus recompile it.
 */
export async function checkRebuild(kit: RdyManifestKit, manifestDir: string): Promise<RebuildStatus> {
  if (kit.source === undefined) {
    return { kind: 'missing', reason: 'no source recorded in manifest' };
  }

  if (kit.path === undefined) {
    return { kind: 'missing', reason: 'no compiled path recorded in manifest' };
  }

  const sourcePath = path.resolve(manifestDir, kit.source);
  if (!existsSync(sourcePath)) {
    return { kind: 'missing', reason: `source file ${kit.source} is gone` };
  }

  const targetPath = path.resolve(manifestDir, kit.path);
  if (!existsSync(targetPath)) {
    return { kind: 'missing', reason: `compiled file ${kit.path} is gone` };
  }

  let rebuild: BundleResult;
  try {
    rebuild = await buildBundle(sourcePath);
  } catch (error: unknown) {
    // A source that no longer compiles is a finding about the kit, not a failure of the invocation,
    // so the sweep goes on to the kits after it.
    return { kind: 'failed', message: describeError(error) };
  }

  const onDisk = readFileSync(targetPath);
  if (rebuild.bytes.equals(onDisk)) {
    return { kind: 'ok' };
  }

  // The generated banner embeds the compiling readyup's version, so a version move alone makes an
  // untouched source rebuild to a different bundle. Carry the recorded version to keep that cause
  // distinguishable from a hand edit.
  const compiledWith = kit.readyupVersion !== VERSION ? kit.readyupVersion : undefined;

  return {
    kind: 'mismatch',
    expected: hashBytes(rebuild.bytes),
    actual: hashBytes(onDisk),
    ...(compiledWith !== undefined && { compiledWith }),
    ...compareToolchain(kit, rebuild),
  };
}

// region | Helpers

/**
 * Returns a mismatch's toolchain annotations: the recorded esbuild against the rebuild's, and every
 * bundled package whose recorded version the rebuild does not reproduce.
 *
 * Empty for an entry recording no `esbuildVersion`, which predates the record. Both axes read the
 * rebuild's own record, so no installed package is ever resolved outside a bundler run.
 */
function compareToolchain(
  kit: RdyManifestKit,
  rebuild: BundleResult,
): Pick<Extract<RebuildStatus, { kind: 'mismatch' }>, 'dependencyChanges' | 'esbuild'> {
  if (kit.esbuildVersion === undefined) return {};

  const dependencyChanges = diffDependencies(kit.bundledDependencies ?? {}, rebuild.bundledDependencies);
  return {
    esbuild: { recorded: kit.esbuildVersion, rebuilt: rebuild.esbuildVersion },
    ...(dependencyChanges.length > 0 && { dependencyChanges }),
  };
}

/** Returns one change per package whose recorded and rebuilt versions differ, sorted by name. */
function diffDependencies(recorded: Record<string, string>, rebuilt: Record<string, string>): DependencyChange[] {
  const names = new Set([...Object.keys(recorded), ...Object.keys(rebuilt)])
    .values()
    .toArray()
    .toSorted((a, b) => a.localeCompare(b));

  const changes: DependencyChange[] = [];
  for (const name of names) {
    const recordedVersion = recorded[name];
    const rebuiltVersion = rebuilt[name];
    if (recordedVersion === rebuiltVersion) continue;
    changes.push({
      name,
      ...(recordedVersion !== undefined && { recorded: recordedVersion }),
      ...(rebuiltVersion !== undefined && { rebuilt: rebuiltVersion }),
    });
  }
  return changes;
}

// endregion | Helpers
