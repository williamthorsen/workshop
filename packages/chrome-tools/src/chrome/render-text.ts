import { render, type Renderers } from '@williamthorsen/readout';

import { formatLocalDate } from '../portable/date-formats.ts';
import { type Environment, formatStatus, resolvePalette, resolveStreamOutputStyle } from '../shared/output.ts';
import { type ThorChromeRefusal, USAGE_CODE } from './invocation.ts';
import { deriveRecordedPort } from './profiles.ts';
import { describeProfileCount, formatCommandLine } from './render.ts';
import type {
  DeleteResult,
  ProfileEntry,
  ProfileOutcome,
  ProfileOutcomes,
  VerbResult,
  VerbResults,
} from './results.ts';

/** One line of prose and the stream on which it is written. */
export interface TextLine {
  line: string;
  stream: 'stderr' | 'stdout';
}

/** What the text renderers read besides the result: the program's name, and how stdout styles a listing. */
export interface TextContext {
  env: Environment;
  isStdoutTerminal: boolean;
  programName: string;
}

/** Returns the lines that report one per-profile outcome, which the entry point writes as soon as the verb reaches it. */
export function renderOutcomeText(outcome: ProfileOutcome, context: TextContext): TextLine[] {
  return render(outcome, createOutcomeRenderers(context));
}

/**
 * Returns the lines that report a refusal of the whole invocation. A usage refusal follows the command-line convention,
 * naming `--help` rather than repeating the usage.
 */
export function renderRefusalText(refusal: ThorChromeRefusal, programName: string): TextLine[] {
  const headline = `${programName}: ${refusal.message}`;
  if (refusal.code === USAGE_CODE) return toStderr([headline, `Try '${programName} --help'.`]);
  return toStderr([headline, ...refusal.hints.map((hint) => `  ${hint}`)]);
}

/**
 * Returns the lines that report a verb's result. For a verb that acts on several profiles, these are only the lines
 * that follow its outcomes, which `renderOutcomeText` reports as they arrive.
 */
export function renderResultText(result: VerbResult, context: TextContext): TextLine[] {
  return render(result, createResultRenderers(context));
}

// region | Helpers

/** Builds the renderer of each per-profile outcome. */
function createOutcomeRenderers(context: TextContext): Renderers<ProfileOutcomes, TextLine[]> {
  return {
    deleted: ({ entry, isDryRun }) => {
      const { name, path, pid } = entry;
      const detail = pid === undefined ? path : `PID ${pid}, ${path}`;
      if (isDryRun) {
        const action = pid === undefined ? 'delete' : 'quit and delete';
        return toStdout([`Would ${action} profile '${name}' (${detail}).`]);
      }
      const verb = pid === undefined ? 'Deleted' : 'Quit and deleted';
      return toStdout([`${verb} profile '${name}' (${detail}).`]);
    },
    quit: ({ entry, isIdle }) => {
      const { name, pid } = entry;
      if (pid === undefined) return toStdout([`Profile '${name}' is not running.`]);
      return toStdout([`Quit ${isIdle ? 'idle ' : ''}profile '${name}' (PID ${pid}).`]);
    },
    refused: ({ error, hints }) =>
      toStderr([`${context.programName}: ${error.message}`, ...hints.map((hint) => `  ${hint}`)]),
    retained: ({ entry }) => toStdout([`Retained profile '${entry.name}': running (PID ${entry.pid ?? ''}).`]),
  };
}

/** Builds the renderer of each verb's result. */
function createResultRenderers(context: TextContext): Renderers<VerbResults, TextLine[]> {
  return {
    delete: (result) => toStdout(describeDeleteSummary(result)),
    launch: ({ browser, entry }) =>
      toStdout([
        `${browser}: profile '${entry.name}' on port ${entry.port ?? ''}${entry.isHeadless === true ? ' (headless)' : ''}`,
        `DevTools: http://127.0.0.1:${entry.port ?? ''}/json/version`,
      ]),
    'launch-plan': ({ command, pages, port, profile }) => {
      const start =
        command === undefined ? `profile '${profile}' is running on port ${port}` : formatCommandLine(command);
      return toStdout([start, ...pages.map((page) => `Opens: ${page}`)]);
    },
    list: (result) => renderList(result.entries, result, context),
    quit: ({ isAll, outcomes }) => toStdout(isAll && outcomes.length === 0 ? ['No running profiles.'] : []),
    'quit-idle': ({ outcomes }) => toStdout(outcomes.length === 0 ? ['No idle profiles.'] : []),
    'show-instance-page': ({ entry }) =>
      toStdout([`Opened the instance page of '${entry.name}' on port ${entry.port ?? ''}.`]),
    status: ({ endpoint, entry }) => {
      const mode = entry.isHeadless === true ? ' (headless)' : '';
      const lines = toStdout([`${entry.name}: ${entry.state}${mode}, endpoint ${endpoint}`]);
      if (entry.state !== 'unknown') return lines;
      return [...lines, ...warnProcessListUnavailable(context.programName, 'status')];
    },
  };
}

/** Returns the lines that follow a delete's outcomes: what `--derived` found absent, or a sweep's totals. */
function describeDeleteSummary(result: DeleteResult): string[] {
  const { isDryRun, missingDerivedDir, outcomes, profilesDir, selection } = result;
  if (missingDerivedDir !== undefined) return [`No profile derived from this worktree (${missingDerivedDir}).`];
  if (selection !== 'all' && selection !== 'stale') return [];
  if (outcomes.length === 0) {
    return [selection === 'stale' ? 'No stale profiles.' : `No profiles in ${profilesDir}.`];
  }
  const counts: Record<ProfileOutcome['type'], number> = { deleted: 0, quit: 0, refused: 0, retained: 0 };
  for (const outcome of outcomes) counts[outcome.type] += 1;
  const verb = isDryRun ? 'Would delete' : 'Deleted';
  const retainedClause = counts.retained === 0 ? '' : `, retaining ${describeProfileCount(counts.retained)}`;
  const failedClause = counts.refused === 0 ? '' : `, failing to quit ${describeProfileCount(counts.refused)}`;
  return [`${verb} ${describeProfileCount(counts.deleted)}${retainedClause}${failedClause}.`];
}

/**
 * Returns the clause that a profile listing appends to name what its provenance implies, or an empty string for a
 * profile that is neither stale nor unrecorded. A live derived profile and a named one get no clause: The absence says
 * that the profile is accounted for.
 */
function describeProvenance(entry: ProfileEntry): string {
  const { facts } = entry;
  if (facts.origin === undefined) return ', unrecorded';
  if (facts.stale !== true) return '';
  if (entry.isRepoPresent === true) return `, stale: branch '${facts.branch ?? ''}' is gone`;
  return `, stale: repository ${facts.repoDir ?? ''} is gone`;
}

/** Returns one glyph-led line per listed profile, reporting its running and debugging state. */
function renderList(
  entries: ProfileEntry[] | undefined,
  result: { isStaleOnly: boolean; profilesDir: string },
  context: TextContext,
): TextLine[] {
  if (entries === undefined) return toStdout([`No profiles: ${result.profilesDir} does not exist.`]);
  if (entries.length === 0) {
    return toStdout([result.isStaleOnly ? 'No stale profiles.' : `No profiles in ${result.profilesDir}.`]);
  }

  const { env, isStdoutTerminal } = context;
  const palette = resolvePalette(env, isStdoutTerminal);
  const { style } = resolveStreamOutputStyle(env, isStdoutTerminal);
  const passed = formatStatus(palette, style, 'passed');
  const info = formatStatus(palette, style, 'info');
  const warning = formatStatus(palette, style, 'warning');
  const lines = entries.map((entry) => {
    const { facts, isHeadless, name, pid = '', port = '' } = entry;
    const mode = isHeadless === true ? ' headless' : '';
    const derivedPort = deriveRecordedPort(facts);
    const derivedNote = derivedPort === undefined ? '' : ` (derived ${derivedPort})`;
    // A running browser keeps the port that it was launched on, which a later launch would not derive
    const divergence = String(derivedPort) === port ? '' : derivedNote;
    const portClause = derivedPort === undefined ? '' : `, port ${derivedPort}`;
    const descriptions = {
      debugging: `  ${passed} ${name}: debugging${mode} on port ${port}${divergence} (PID ${pid})`,
      deleted: '',
      'running-without-port': `  ${warning} ${name}: running${mode} (PID ${pid}), no debugging port${derivedNote}`,
      stopped: `  ${info} ${name}: stopped${portClause}`,
      unknown: `  ${warning} ${name}: state unknown${portClause}`,
      unresponsive: `  ${warning} ${name}: running${mode} (PID ${pid}), port ${port}${divergence} not answering`,
    };
    const lastUsed = facts.lastUsed === undefined ? '' : `, last used ${formatLocalDate(facts.lastUsed)}`;
    return `${descriptions[entry.state]}${lastUsed}${describeProvenance(entry)}`;
  });
  const isUnknown = entries.some((entry) => entry.state === 'unknown');
  return [...toStdout(lines), ...(isUnknown ? warnProcessListUnavailable(context.programName, 'list') : [])];
}

/** Returns lines to be written on stderr. */
function toStderr(lines: readonly string[]): TextLine[] {
  return lines.map((line) => ({ line, stream: 'stderr' }));
}

/** Returns lines to be written on stdout. */
function toStdout(lines: readonly string[]): TextLine[] {
  return lines.map((line) => ({ line, stream: 'stdout' }));
}

/**
 * Returns the warning that the reported state is unknown because the process list could not be read, naming the
 * command to rerun from a terminal.
 */
function warnProcessListUnavailable(programName: string, verb: string): TextLine[] {
  return toStderr([
    `${programName}: could not read the process list, so the reported state is unknown rather than stopped`,
    `  Run ${programName} ${verb} from a terminal outside the sandbox.`,
  ]);
}

// endregion | Helpers
