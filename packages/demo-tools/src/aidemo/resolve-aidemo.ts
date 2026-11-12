import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { isRecord } from '@williamthorsen/toolbelt.objects';

/**
 * The oldest aidemo whose `voice.json` records each scene's provider and voice, which an archived take's provenance
 * reads; it also times captions to the final video and keys its voice cache by the TTS endpoint and model.
 */
export const MIN_AIDEMO_VERSION = '0.20.3';

/** The command that installs the latest aidemo, which satisfies the minimum. */
export const AIDEMO_INSTALL_COMMAND = 'pnpm add --save-dev @tandryukha/aidemo';

/** The installed aidemo that a launch runs. */
export interface ResolvedAidemo {
  readonly bin: string;
  readonly version: string;
}

/** The outcome of resolving aidemo: the installed engine, or a message naming what is wrong and how to fix it. */
export type AidemoResolution = { ok: true; aidemo: ResolvedAidemo } | { ok: false; message: string };

const PACKAGE_NAME = '@tandryukha/aidemo';

/**
 * Resolves the aidemo installed in the demo repository at `root`, never one beside this package, and refuses one
 * that is missing, older than `MIN_AIDEMO_VERSION`, or without an `aidemo` bin.
 */
export function resolveAidemo(root: string): AidemoResolution {
  const manifestPath = findManifest(root);
  if (manifestPath === undefined) return refuse(`${PACKAGE_NAME} is not installed in ${root}`);

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return refuse(`${manifestPath} cannot be read (${describeError(error)})`);
  }
  if (!isRecord(manifest)) return refuse(`${manifestPath} is not a JSON object`);

  const version = manifest['version'];
  const parsed = typeof version === 'string' ? parseVersion(version) : undefined;
  if (typeof version !== 'string' || parsed === undefined) {
    return refuse(`${PACKAGE_NAME} in ${root} does not declare a version that can be compared`);
  }
  if (compareVersions(parsed, parseVersion(MIN_AIDEMO_VERSION) ?? [0, 0, 0]) < 0) {
    return refuse(`${PACKAGE_NAME} ${version} is installed in ${root}, but ${MIN_AIDEMO_VERSION} or later is required`);
  }

  const binEntry = readBinEntry(manifest['bin']);
  if (binEntry === undefined) return refuse(`${PACKAGE_NAME} ${version} does not declare an aidemo bin`);

  return { ok: true, aidemo: { bin: path.resolve(path.dirname(manifestPath), binEntry), version } };
}

// region | Helpers

/** Orders two `[major, minor, patch]` triples. */
function compareVersions(left: readonly number[], right: readonly number[]): number {
  for (const [index, part] of left.entries()) {
    const difference = part - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

/**
 * Returns the aidemo manifest in the `node_modules` of `root` or of the nearest ancestor that has one. The search
 * ignores `NODE_PATH`, which a pnpm bin shim points at the store of the package that it launches.
 */
function findManifest(root: string): string | undefined {
  let dir = path.resolve(root);
  for (;;) {
    if (path.basename(dir) !== 'node_modules') {
      const candidate = path.join(dir, 'node_modules', PACKAGE_NAME, 'package.json');
      if (existsSync(candidate)) return candidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Returns the leading `major.minor.patch` of a version as numbers, ignoring any prerelease or build suffix. */
function parseVersion(version: string): number[] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) return undefined;

  return match.slice(1, 4).map((part) => Number.parseInt(part, 10));
}

/** Reads the `aidemo` bin from a manifest's `bin`, which is either a path or a map of names to paths. */
function readBinEntry(bin: unknown): string | undefined {
  if (typeof bin === 'string') return bin;
  if (!isRecord(bin)) return undefined;

  const entry = bin['aidemo'];
  return typeof entry === 'string' ? entry : undefined;
}

/** Builds a refusal that ends with the command that installs a supported aidemo. */
function refuse(problem: string): AidemoResolution {
  return { ok: false, message: `${problem}; install a supported aidemo with ${AIDEMO_INSTALL_COMMAND}` };
}

// endregion | Helpers
