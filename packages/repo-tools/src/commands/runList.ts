import { expandTilde } from '../portable/paths.ts';
import { readRegistry, selectEntries } from '../registry/registry.ts';
import { reportFailure, type VerbRun } from './verb-run.ts';

export const CLONE_STATES = ['present', 'absent', 'all'] as const;

/** The selection and output form of a `list` run. */
export interface ListOptions {
  clone: (typeof CLONE_STATES)[number];
  isJson: boolean;
  runner: string | undefined;
  stack: string | undefined;
  tag: string | undefined;
  visibility: string | undefined;
}

/** Runs `list`: prints the selected entries as absolute paths, or as JSON with each path as written. */
export function runList(run: VerbRun, options: ListOptions): number {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return reportFailure(run, registry);
  const matched = selectEntries(registry.entries, options);
  // The drift sweep reads a missing path as a repo without a clone here, so a pathless entry is refused instead.
  if (matched.some((entry) => entry.path === undefined)) {
    return reportFailure(run, `registry entry has no path: ${run.file}`);
  }
  const selected =
    options.clone === 'all'
      ? matched
      : matched.filter(
          (entry) =>
            run.adapters.isDirectory(expandTilde(entry.path ?? '', run.home)) === (options.clone === 'present'),
        );

  if (options.isJson) {
    run.stdout(JSON.stringify({ repos: selected.map((entry): unknown => entry.node.toJSON()) }, null, 2));
    return 0;
  }
  for (const entry of selected) run.stdout(expandTilde(entry.path ?? '', run.home));
  return 0;
}
