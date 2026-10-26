import { formatLocalDate } from '../portable/date-formats.ts';
import { formatStatus, resolvePalette, resolveStreamOutputStyle } from '../shared/output.ts';
import { resolveProfileState } from './browser-process.ts';
import { type Invocation, type JsonValue, requireCommand } from './invocation.ts';
import { listProfileNames, resolveProfileFacts } from './profiles.ts';
import { describeProvenance, renderProfile, warnProcessListUnavailable, writeJson, writeProse } from './render.ts';

/** Reports every profile, or every stale one, with its running and debugging state. */
export function listProfiles(invocation: Invocation, isStaleOnly: boolean): number {
  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'pgrep');
  if (invocation.format === 'json') {
    writeProfilesJson(invocation, isStaleOnly);
  } else {
    writeProfilesProse(invocation, isStaleOnly);
  }
  return 0;
}

// region | Helpers

/**
 * Writes every profile, or every stale one, as one JSON document under a `profiles` key. A profiles directory that does
 * not exist contains no profiles, so the report is an empty list rather than the sentence printed by the prose renderer.
 */
function writeProfilesJson(invocation: Invocation, isStaleOnly: boolean): void {
  const entries: JsonValue[] = [];
  const names = listProfileNames(invocation) ?? [];
  for (const name of names) {
    const dir = `${invocation.profilesDir}/${name}`;
    const facts = resolveProfileFacts(invocation, dir);
    if (isStaleOnly && facts.stale !== true) continue;
    const { pid, port, state } = resolveProfileState(invocation, dir);
    entries.push(renderProfile(invocation, { facts, name, path: dir, pid, port, state }));
  }
  writeJson(invocation, { profiles: entries });
}

/** Writes one glyph-led line per profile, or per stale profile, reporting its running and debugging state. */
function writeProfilesProse(invocation: Invocation, isStaleOnly: boolean): void {
  const names = listProfileNames(invocation);
  if (names === undefined) {
    writeProse(invocation, 'stdout', [`No profiles: ${invocation.profilesDir} does not exist.`]);
    return;
  }

  const palette = resolvePalette(invocation.deps.env, invocation.deps.isStdoutTerminal);
  const { style } = resolveStreamOutputStyle(invocation.deps.env, invocation.deps.isStdoutTerminal);
  const passed = formatStatus(palette, style, 'passed');
  const info = formatStatus(palette, style, 'info');
  const warning = formatStatus(palette, style, 'warning');
  let isFound = false;
  let isUnknown = false;
  for (const name of names) {
    const dir = `${invocation.profilesDir}/${name}`;
    const facts = resolveProfileFacts(invocation, dir);
    if (isStaleOnly && facts.stale !== true) continue;
    isFound = true;
    const { pid = '', port = '', state } = resolveProfileState(invocation, dir);
    const descriptions = {
      debugging: `  ${passed} ${name}: debugging on port ${port} (PID ${pid})`,
      'running-without-port': `  ${warning} ${name}: running (PID ${pid}), no debugging port`,
      stopped: `  ${info} ${name}: stopped`,
      unknown: `  ${warning} ${name}: state unknown`,
      unresponsive: `  ${warning} ${name}: running (PID ${pid}), port ${port} not answering`,
    };
    if (state === 'unknown') isUnknown = true;
    const lastUsed = facts.lastUsed === undefined ? '' : `, last used ${formatLocalDate(facts.lastUsed)}`;
    writeProse(invocation, 'stdout', [`${descriptions[state]}${lastUsed}${describeProvenance(facts)}`]);
  }

  if (!isFound) {
    writeProse(invocation, 'stdout', [
      isStaleOnly ? 'No stale profiles.' : `No profiles in ${invocation.profilesDir}.`,
    ]);
  }
  if (isUnknown) warnProcessListUnavailable(invocation, 'list');
}

// endregion | Helpers
