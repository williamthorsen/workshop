import path from 'node:path';

import { expandTilde } from '../portable/paths.ts';
import {
  assertWritable,
  readRegistry,
  type RegistryEntry,
  saveRegistry,
  writeGitHubFields,
  writeStack,
} from '../registry/registry.ts';
import { detectStack } from '../stacks/stack-detection.ts';
import { formatEntryName, PROG, reportFailure, type VerbRun } from './verb-run.ts';

/**
 * Runs `scan`: reports each entry whose stack, visibility, or runner differs from its clone and GitHub, and rewrites
 * them under `--write`.
 */
export function runScan(run: VerbRun, isWrite: boolean): number {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return reportFailure(run, registry);
  if (registry.entries.some((entry) => entry.path === undefined)) {
    return reportFailure(run, `registry entry has no path: ${run.file}`);
  }
  if (isWrite) {
    const refusal = assertWritable(run.file, run.adapters.readCurrentBranch);
    if (refusal !== undefined) return reportFailure(run, refusal);
  }

  let isChanged = false;
  const cloneless: string[] = [];
  for (const entry of registry.entries) {
    const label = formatEntryName(entry);
    const changes: string[] = [];
    const detected = scanClone(run, expandTilde(entry.path ?? '', run.home), label);
    if (detected === undefined) {
      cloneless.push(label);
    } else {
      changes.push(
        ...detected.filter((name) => !entry.stack.includes(name)).map((name) => `+${name}`),
        ...entry.stack
          .toSorted()
          .filter((name) => !detected.includes(name))
          .map((name) => `-${name}`),
      );
      writeStack(registry, entry, detected);
    }
    changes.push(...scanGitHub(run, entry, label));
    if (entry.visibility === 'public' && entry.runner !== undefined) {
      run.stderr(
        `${PROG}: ${label}: public repo routes CI to runner ${entry.runner}; a self-hosted runner must not run a fork's pull request`,
      );
    }
    if (changes.length === 0) continue;
    run.stdout(`${label}: ${changes.join(' ')}`);
    isChanged = true;
  }
  if (cloneless.length > 0) {
    run.stderr(`${PROG}: no clone on this machine, so the stack is kept, for: ${cloneless.join(', ')}`);
  }

  if (isWrite && isChanged) saveRegistry(registry, run.file);
  return 0;
}

/**
 * Returns the stack names that a clone's tracked files signal, reporting each unreadable manifest on stderr, or
 * `undefined` when the clone's tracked files cannot be listed.
 */
export function scanClone(run: VerbRun, cloneDir: string, label: string = cloneDir): string[] | undefined {
  const trackedPaths = run.adapters.listTrackedFiles(cloneDir);
  if (trackedPaths === undefined) return undefined;
  const detection = detectStack(trackedPaths, (trackedPath) => run.adapters.readFile(path.join(cloneDir, trackedPath)));
  for (const problem of detection.problems) run.stderr(`${PROG}: ${label}: ${problem}`);
  return detection.stack;
}

// region | Helpers

/**
 * Reads an entry's visibility and runner from GitHub, writes the values that differ into the entry, and returns the
 * changes as `scan` reports them. A value that cannot be read is reported on stderr and kept.
 */
function scanGitHub(run: VerbRun, entry: RegistryEntry, label: string): string[] {
  if (entry.repo === undefined) {
    run.stderr(`${PROG}: ${label}: no repo; its visibility and runner are kept`);
    return [];
  }
  const facts = run.github(entry.repo);
  if (typeof facts === 'string') {
    run.stderr(`${PROG}: ${label}: cannot read GitHub: ${facts}; its visibility and runner are kept`);
    return [];
  }
  let runner = facts.runner;
  if (facts.runnerProblem !== undefined) {
    run.stderr(`${PROG}: ${label}: CI_RUNS_ON ${facts.runnerProblem}; its runner is kept`);
    runner = entry.runner;
  }
  const changes: string[] = [];
  if (facts.visibility !== entry.visibility) changes.push(`visibility=${facts.visibility}`);
  if (runner !== entry.runner) changes.push(runner === undefined ? '-runner' : `runner=${runner}`);
  if (changes.length > 0) writeGitHubFields(entry, { runner, visibility: facts.visibility });
  return changes;
}

// endregion | Helpers
