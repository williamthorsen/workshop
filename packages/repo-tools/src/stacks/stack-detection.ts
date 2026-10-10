import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { STACK_DETECTORS, type StackDetector } from './stack-detectors.ts';

/** The stack names that a repository's tracked files signal, and the manifests that could not be read. */
export interface StackDetection {
  problems: string[];
  stack: string[];
}

/**
 * Returns the sorted stack names whose detector matches the tracked paths, or the dependencies declared by any tracked
 * `package.json`. `readManifest` returns a manifest's text by its tracked path and may throw; a manifest that cannot
 * be read or parsed is reported in `problems` and skipped.
 */
export function detectStack(
  trackedPaths: readonly string[],
  readManifest: (trackedPath: string) => string,
  detectors: Readonly<Record<string, StackDetector>> = STACK_DETECTORS,
): StackDetection {
  const problems: string[] = [];
  const dependencies = new Set<string>();
  for (const trackedPath of trackedPaths) {
    if (path.posix.basename(trackedPath) !== 'package.json') continue;
    const names = readDependencyNames(trackedPath, readManifest);
    if (typeof names === 'string') {
      problems.push(names);
      continue;
    }
    for (const name of names) dependencies.add(name);
  }

  const stack = Object.entries(detectors)
    .filter(
      ([, detector]) =>
        (detector.dependencies ?? []).some((name) => dependencies.has(name)) ||
        (detector.paths ?? []).some((glob) => trackedPaths.some((trackedPath) => matchesAtAnyDepth(trackedPath, glob))),
    )
    .map(([name]) => name)
    .toSorted();
  return { problems, stack };
}

// region | Helpers

/** Reports whether a tracked path matches a glob at the repository root or below any directory. */
function matchesAtAnyDepth(trackedPath: string, glob: string): boolean {
  return path.posix.matchesGlob(trackedPath, glob) || path.posix.matchesGlob(trackedPath, `**/${glob}`);
}

/**
 * Returns the keys of a manifest's `dependencies` and `devDependencies`, or a message naming why it could not be read.
 * `peerDependencies` are left out, because a peer declares the host's stack rather than the repository's.
 */
function readDependencyNames(trackedPath: string, readManifest: (trackedPath: string) => string): string[] | string {
  let manifest: unknown;
  try {
    manifest = JSON.parse(readManifest(trackedPath));
  } catch (error) {
    return `cannot read ${trackedPath}: ${describeError(error)}`;
  }
  if (!isRecord(manifest)) return `cannot read ${trackedPath}: not a JSON object`;
  return ['dependencies', 'devDependencies'].flatMap((key) => {
    const section = manifest[key];
    return isRecord(section) ? Object.keys(section) : [];
  });
}

/** Reports whether a value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// endregion | Helpers
