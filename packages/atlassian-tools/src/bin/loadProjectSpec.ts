import { parseProjectSpec, type ProjectSpec } from '@williamthorsen/toolbelt.atlassian/candidate';

import type { RunEffects } from './subcommand-support.ts';

/**
 * Reads the spec named by `--spec`, or else the one found by ascending from the working directory, returning
 * `undefined` when the search finds none. A named spec that cannot be read throws.
 *
 * @internal
 */
export function loadProjectSpec(effects: RunEffects, specFlag: string | undefined): LoadedProjectSpec | undefined {
  const specPath = specFlag ?? effects.findSpecPath(effects.cwd());
  if (specPath === undefined) return undefined;

  return { path: specPath, spec: parseProjectSpec(effects.readTextFile(specPath)) };
}

export interface LoadedProjectSpec {
  readonly path: string;
  readonly spec: ProjectSpec;
}
