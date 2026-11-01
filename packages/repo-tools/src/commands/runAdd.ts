import path from 'node:path';

import { expandTilde, formatDisplayPath } from '../portable/paths.ts';
import {
  appendEntry,
  assertWritable,
  type NewEntry,
  parseRegistry,
  readRegistry,
  saveRegistry,
  serializeRegistry,
} from '../registry/registry.ts';
import { scanClone } from './runScan.ts';
import { formatEntryName, parseRemoteUrl, PROG, reportFailure, type VerbRun } from './verb-run.ts';

/** The host whose origins `add` registers with a `repo` and reads from GitHub. */
const GITHUB_HOST = 'github.com';

/** Runs `add`: prints the entry that registers a clone, and appends it under `--write`. */
export function runAdd(run: VerbRun, target: string, isWrite: boolean): number {
  const registry = readRegistry(run.file);
  if (typeof registry === 'string') return reportFailure(run, registry);
  const cloneDir = run.adapters.readCloneRoot(path.resolve(run.cwd, expandTilde(target, run.home)));
  if (cloneDir === undefined) return reportFailure(run, `${target} is not in a git clone`);
  const origin = run.adapters.readOriginUrl(cloneDir);
  if (origin === undefined) return reportFailure(run, `${cloneDir} has no origin remote`);
  const remote = parseRemoteUrl(origin);
  if (remote === undefined) return reportFailure(run, `cannot read an owner and a name from the origin URL ${origin}`);
  const repo = remote.host === GITHUB_HOST ? remote.path : undefined;

  const entryPath = formatDisplayPath(cloneDir, run.home);
  const existing = registry.entries.find(
    (entry) =>
      (repo !== undefined && entry.repo === repo) ||
      (entry.path !== undefined && expandTilde(entry.path, run.home) === cloneDir),
  );
  if (existing !== undefined)
    return reportFailure(run, `${cloneDir} is already registered as ${formatEntryName(existing)}`);

  const detection = scanClone(run, cloneDir);
  if (detection === undefined) return reportFailure(run, `cannot list the tracked files of ${cloneDir}`);
  const entry: NewEntry = {
    name: remote.path.slice(remote.path.indexOf('/') + 1),
    path: entryPath,
    repo,
    stack: detection,
  };
  if (repo === undefined) {
    run.stderr(
      `${PROG}: ${cloneDir}: origin host ${remote.host} is not ${GITHUB_HOST}; the entry omits repo, visibility, and runner`,
    );
  } else {
    readGitHubFields(run, repo, entry);
  }

  const preview = parseRegistry('repos:\n');
  if (typeof preview !== 'string') {
    appendEntry(preview, entry);
    for (const line of serializeRegistry(preview)
      .replace(/^repos:\n/, '')
      .trimEnd()
      .split('\n'))
      run.stdout(line);
  }
  if (!isWrite) {
    run.stderr(`${PROG}: nothing written; pass --write to append the entry to ${run.file}`);
    return 0;
  }

  const refusal = assertWritable(run.file, run.adapters.readCurrentBranch);
  if (refusal !== undefined) return reportFailure(run, refusal);
  appendEntry(registry, entry);
  saveRegistry(registry, run.file);
  run.stderr(`${PROG}: appended ${entry.name} to ${run.file}`);
  return 0;
}

// region | Helpers

/** Writes the visibility and runner that GitHub reports into the entry, reporting each omitted value on stderr. */
function readGitHubFields(run: VerbRun, repo: string, entry: NewEntry): void {
  const facts = run.github(repo);
  if (typeof facts === 'string') {
    run.stderr(`${PROG}: ${repo}: cannot read GitHub: ${facts}; the entry omits visibility and runner`);
    return;
  }
  entry.visibility = facts.visibility;
  if (facts.runnerProblem === undefined) {
    entry.runner = facts.runner;
  } else {
    run.stderr(`${PROG}: ${repo}: CI_RUNS_ON ${facts.runnerProblem}; the entry omits runner`);
  }
}

// endregion | Helpers
