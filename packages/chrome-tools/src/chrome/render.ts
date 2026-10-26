import { formatIsoTimestamp } from '../portable/date-formats.ts';
import { quoteBashArgument } from '../portable/shell-quote.ts';
import { isDirectory } from '../shared/paths.ts';
import { type ProfileStateName, resolveProfileState } from './browser-process.ts';
import { type Invocation, type JsonValue, type ThorChromeRefusal, USAGE_CODE } from './invocation.ts';
import { type ProfileFacts, resolveProfileFacts } from './profiles.ts';

/** What a profile's JSON object reports, besides what `resolveProfileFacts` reads from the profile itself. */
export interface ProfileReport {
  /** The refusal of this profile, reported on its entry. */
  error?: { code: string; message: string };
  /** Facts read before the profile was removed, which cannot be read back from a directory that is gone. */
  facts?: ProfileFacts;
  name: string;
  path: string;
  pid: string | undefined;
  port: string | undefined;
  /** Why a sweep kept the profile. */
  retained?: string;
  state: ProfileStateName | 'deleted';
}

/** Returns a count of profiles with its noun, so that a summary reads `1 profile` rather than `1 profiles`. */
export function describeProfileCount(count: number): string {
  return count === 1 ? '1 profile' : `${count} profiles`;
}

/**
 * Returns the clause that a profile listing appends to name what its provenance implies, or an empty string for a
 * profile that is neither stale nor unrecorded. A live derived profile and a named one get no clause: The absence says
 * that the profile is accounted for.
 */
export function describeProvenance(facts: ProfileFacts): string {
  if (facts.origin === undefined) return ', unrecorded';
  if (facts.stale !== true) return '';
  if (isDirectory(facts.repoDir ?? '')) return `, stale: branch '${facts.branch ?? ''}' is gone`;
  return `, stale: repository ${facts.repoDir ?? ''} is gone`;
}

/**
 * Writes the report of a verb that acts on several profiles, under `--json`, and returns 1 when any profile was
 * refused.
 */
export function finishProfileReport(invocation: Invocation, isDryRun: boolean): number {
  if (invocation.format === 'json') {
    writeJson(invocation, isDryRun ? { profiles: invocation.entries, dryRun: true } : { profiles: invocation.entries });
  }
  return invocation.refused ? 1 : 0;
}

/** Returns a command line as one shell-quoted line that pastes back into a shell as the same argv. */
export function formatCommandLine(args: readonly string[]): string {
  return args.map((argument) => quoteBashArgument(argument)).join(' ');
}

/**
 * Returns one profile as a JSON object, reading its provenance from the profile unless the caller passes the facts.
 *
 * The endpoint is reported only in state `debugging`. One that does not answer is not an endpoint, and a URL beside any
 * other state would invite a caller to use it.
 */
export function renderProfile(invocation: Invocation, report: ProfileReport): { [key: string]: JsonValue } {
  const facts = report.facts ?? resolveProfileFacts(invocation, report.path);
  const devtools = report.state === 'debugging' ? `http://127.0.0.1:${report.port ?? ''}/json/version` : undefined;
  const rendered: { [key: string]: JsonValue } = {
    name: report.name,
    path: report.path,
    state: report.state,
    pid: toNumber(report.pid),
    port: toNumber(report.port),
    devtools: devtools ?? null,
    origin: facts.origin ?? null,
    repo: facts.repo ?? null,
    branch: facts.branch ?? null,
    stale: facts.stale ?? null,
    lastUsedAt: facts.lastUsed === undefined ? null : formatIsoTimestamp(facts.lastUsed),
  };
  if (report.retained !== undefined) rendered['retained'] = report.retained;
  if (report.error !== undefined) rendered['error'] = report.error;
  return rendered;
}

/**
 * Reports a refusal of the whole invocation and returns its status: as prose on stderr, or as one JSON document on
 * stdout that names the resolved profile beside the error.
 *
 * A usage refusal follows the command-line convention, naming `--help` rather than repeating the usage.
 */
export function renderRefusal(invocation: Invocation, refusal: ThorChromeRefusal): number {
  const { output } = invocation;
  if (invocation.format === 'json') {
    const document: { [key: string]: JsonValue } = {
      error: { code: refusal.code, message: refusal.message, ...refusal.extra },
    };
    if (refusal.profile !== undefined) {
      const { dir, name } = refusal.profile;
      const { pid, port, state } = resolveProfileState(invocation, dir);
      document['profile'] = renderProfile(invocation, { name, path: dir, pid, port, state });
    }
    writeJson(invocation, document);
    return refusal.exitCode;
  }

  if (refusal.code === USAGE_CODE) {
    output.stderr.write(`Error: ${refusal.message}\nTry '${output.name} --help'.\n`);
    return refusal.exitCode;
  }
  writeProse(invocation, 'stderr', [`${output.name}: ${refusal.message}`, ...refusal.hints.map((hint) => `  ${hint}`)]);
  return refusal.exitCode;
}

/**
 * Reports the refusal of one profile without ending the invocation, as prose on stderr or as an `error` on the
 * profile's entry, and marks the invocation as failed, so that it exits 1 once every other profile has been processed.
 */
export function reportProfileRefusal(
  invocation: Invocation,
  profile: string,
  error: { code: string; message: string },
  hints: readonly string[] = [],
): void {
  invocation.refused = true;
  if (invocation.format === 'json') {
    const dir = `${invocation.profilesDir}/${profile}`;
    const { pid, port, state } = resolveProfileState(invocation, dir);
    invocation.entries.push(renderProfile(invocation, { error, name: profile, path: dir, pid, port, state }));
    return;
  }
  writeProse(invocation, 'stderr', [
    `${invocation.output.name}: ${error.message}`,
    ...hints.map((hint) => `  ${hint}`),
  ]);
}

/** Returns a value as JSON, writing each control character other than `\n`, `\r`, and `\t` as `\u00XX`. */
export function stringifyJson(value: JsonValue): string {
  return JSON.stringify(value).replaceAll(/\\(.)/g, (escape: string, character: string) => {
    if (character === 'b') return String.raw`\u0008`;
    if (character === 'f') return String.raw`\u000c`;
    return escape;
  });
}

/**
 * Warns on stderr that the reported state is unknown because the process list could not be read, naming the command
 * to rerun from a terminal.
 */
export function warnProcessListUnavailable(invocation: Invocation, verb: string): void {
  const { name } = invocation.output;
  writeProse(invocation, 'stderr', [
    `${name}: could not read the process list, so the reported state is unknown rather than stopped`,
    `  Run ${name} ${verb} from a terminal outside the sandbox.`,
  ]);
}

/** Writes one JSON document on stdout. */
export function writeJson(invocation: Invocation, value: JsonValue): void {
  invocation.output.stdout.write(`${stringifyJson(value)}\n`);
}

/** Writes lines to one of the command's streams. */
export function writeProse(invocation: Invocation, stream: 'stderr' | 'stdout', lines: readonly string[]): void {
  invocation.output[stream].write(lines.map((line) => `${line}\n`).join(''));
}

// region | Helpers

/** Returns a numeric string as a number, or `null` when it is unset. */
function toNumber(value: string | undefined): number | null {
  return value === undefined || value === '' ? null : Number(value);
}

// endregion | Helpers
