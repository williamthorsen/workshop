import { spawnSync } from 'node:child_process';

/**
 * What GitHub reports about a repo. `runnerProblem` names a `CI_RUNS_ON` value that does not select a single label, in
 * which case `runner` is `undefined` and is not to be written.
 */
export interface GitHubFacts {
  runner: string | undefined;
  runnerProblem: string | undefined;
  visibility: 'public' | 'private';
}

/** Reads a repo's facts by its `owner/name` path, or returns the reason that they cannot be read. */
export type GitHubReader = (repo: string) => GitHubFacts | string;

/** Builds a reader that queries GitHub through `gh api`, running `gh` under the given environment. */
export function createGhReader(env: Readonly<Record<string, string | undefined>>): GitHubReader {
  return (repo) => {
    const visibilityResult = runGh(env, ['api', `repos/${repo}`, '--jq', '.visibility']);
    if (typeof visibilityResult === 'string') return visibilityResult;
    if (visibilityResult.status !== 0) return describeGhFailure(visibilityResult.stderr);
    const visibility = parseVisibility(visibilityResult.stdout.trim());
    if (visibility === undefined) return `unsupported visibility ${visibilityResult.stdout.trim()}`;

    const variableResult = runGh(env, ['api', `repos/${repo}/actions/variables/CI_RUNS_ON`, '--jq', '.value']);
    if (typeof variableResult === 'string') return variableResult;
    if (variableResult.status !== 0) {
      if (variableResult.stderr.includes('HTTP 404')) {
        return { runner: undefined, runnerProblem: undefined, visibility };
      }
      return describeGhFailure(variableResult.stderr);
    }
    const runner = parseRunnerValue(variableResult.stdout.replace(/\n$/, ''));
    return typeof runner === 'string'
      ? { runner, runnerProblem: undefined, visibility }
      : { runner: undefined, runnerProblem: runner.problem, visibility };
  };
}

/**
 * Returns the runner label that a `CI_RUNS_ON` value selects, read as the workflows' `runs-on` expression reads it: A
 * value that opens with `"` is a JSON string, and any value that does not open with `[`, `{`, or `"` is a bare label.
 */
export function parseRunnerValue(raw: string): string | { problem: string } {
  const value = raw.trim();
  if (value.startsWith('[') || value.startsWith('{')) return { problem: `selects more than one label: ${value}` };
  let label = value;
  if (value.startsWith('"')) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(value);
    } catch {
      return { problem: `is not valid JSON: ${value}` };
    }
    if (typeof decoded !== 'string') return { problem: `is not valid JSON: ${value}` };
    label = decoded.trim();
  }
  return label === '' ? { problem: 'is empty' } : label;
}

/** Returns a visibility that the registry records, or `undefined` for any other value. */
export function parseVisibility(raw: string): 'public' | 'private' | undefined {
  return raw === 'public' || raw === 'private' ? raw : undefined;
}

// region | Helpers

/** Returns the first line of `gh`'s stderr, or a generic reason when it printed nothing. */
function describeGhFailure(stderr: string): string {
  return stderr.trim().split('\n')[0] || 'gh failed without a message';
}

/** Runs `gh` and returns its status and output, or the reason that it could not be started. */
function runGh(
  env: Readonly<Record<string, string | undefined>>,
  args: readonly string[],
): { status: number | null; stderr: string; stdout: string } | string {
  const result = spawnSync('gh', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error !== undefined) return `cannot run gh: ${result.error.message}`;
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

// endregion | Helpers
