import { parseProjectSpec, type ProjectSpec } from '@williamthorsen/toolbelt.atlassian/candidate';
import { UsageError } from '@williamthorsen/toolbelt.cli/candidate';

import { describeError } from './reportFailures.ts';
import type { RunEffects } from './RunEffects.ts';

/**
 * Reads the spec named by `--spec`, or else the one found by ascending from the working directory, returning
 * `undefined` when the search finds none. A spec that cannot be read throws a usage error.
 *
 * @internal
 */
export function loadProjectSpec(effects: RunEffects, specFlag: string | undefined): LoadedProjectSpec | undefined {
  const specPath = specFlag ?? effects.findSpecPath(effects.cwd());
  if (specPath === undefined) return undefined;

  return { path: specPath, spec: parseProjectSpec(readSpecText(effects, specPath)) };
}

export interface LoadedProjectSpec {
  readonly path: string;
  readonly spec: ProjectSpec;
}

// region | Helpers

/** Reads the spec file, reporting any failure to read it as a usage error. */
function readSpecText(effects: RunEffects, specPath: string): string {
  try {
    return effects.readTextFile(specPath);
  } catch (error) {
    throw new UsageError(describeError(error), { cause: error });
  }
}

// endregion | Helpers
