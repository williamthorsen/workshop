import fs from 'node:fs';

import { type Invocation, refuse, requireCommand, runTolerantly, USAGE_CODE } from './invocation.ts';
import { listRunningProfiles, readQuitTimeout, reportQuit, type RunningProfile, terminateBrowser } from './quit.ts';
import { finishProfileReport, writeProse } from './render.ts';

/** Where `quit --idle` records, across runs, since when each running browser has had no client connected. */
export const IDLE_RECORD_FILE = '.thor-chrome.idle';

/** When a browser process was first found without a client. */
interface IdleEntry {
  /** Epoch seconds. */
  idleSince: number;
  pid: string;
}

/** Whether a CDP client is connected to a browser: `unknown` when that cannot be read. */
type ClientState = 'connected' | 'idle' | 'unknown';

const UNIT_SECONDS: Record<string, number> = { d: 86_400, h: 3_600, m: 60, s: 1 };

/**
 * Quits each running browser that no CDP client has been connected to for at least the duration, keeping its profile.
 *
 * Idle time counts from the first run that found the browser process without a client, which the idle record keeps
 * between runs, so a run quits nothing that an earlier run did not already see idle. A browser whose client state
 * cannot be read counts as connected.
 */
export async function quitIdleProfiles(invocation: Invocation, durationText: string): Promise<number> {
  const durationSeconds = parseDuration(invocation, durationText);
  const timeout = readQuitTimeout(invocation);
  requireCommand(invocation, 'curl');
  requireCommand(invocation, 'lsof');
  requireCommand(invocation, 'pgrep');

  const recordFile = `${invocation.profilesDir}/${IDLE_RECORD_FILE}`;
  const previous = readIdleRecord(recordFile);
  const next = new Map<string, IdleEntry>();
  const now = Math.floor(invocation.deps.now() / 1_000);
  let quitCount = 0;

  for (const profile of listRunningProfiles(invocation)) {
    if (readClientState(invocation, profile) !== 'idle') continue;

    const entry = previous.get(profile.name);
    const idleSince = entry?.pid === profile.pid ? entry.idleSince : now;
    if (now - idleSince < durationSeconds) {
      next.set(profile.name, { idleSince, pid: profile.pid });
      continue;
    }
    if (await terminateBrowser(invocation, profile.name, profile.pid, timeout)) {
      reportQuit(invocation, profile.name, profile.pid, `Quit idle profile '${profile.name}' (PID ${profile.pid}).`);
      quitCount += 1;
    } else {
      next.set(profile.name, { idleSince, pid: profile.pid });
    }
  }

  if (fs.existsSync(invocation.profilesDir)) writeIdleRecord(recordFile, next);
  if (quitCount === 0 && !invocation.refused && invocation.format === 'prose') {
    writeProse(invocation, 'stdout', ['No idle profiles.']);
  }
  return finishProfileReport(invocation, false);
}

/** Returns a duration of whole seconds, minutes, hours, or days, such as `2h`, in seconds, refusing any other form. */
export function parseDuration(invocation: Invocation, text: string): number {
  const [, count, unit] = /^([1-9]\d*)([dhms])$/.exec(text) ?? [];
  if (count === undefined || unit === undefined) {
    throw refuse(invocation, USAGE_CODE, `invalid duration '${text}' (a whole number and s, m, h, or d, as in 2h)`);
  }
  return Number(count) * (UNIT_SECONDS[unit] ?? 1);
}

// region | Helpers

/** Reports whether the value is an idle entry as the record stores it. */
function isIdleEntry(value: unknown): value is IdleEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'idleSince' in value &&
    typeof value.idleSince === 'number' &&
    'pid' in value &&
    typeof value.pid === 'string'
  );
}

/**
 * Reads whether a client holds an established connection on the browser's debugging port. Only `lsof`'s clean
 * nothing-found answer counts as idle: Any other answer proves nothing about the browser.
 */
function readClientState(invocation: Invocation, profile: RunningProfile): ClientState {
  if (profile.port === undefined) return 'unknown';
  const args = ['-nP', '-a', '-p', profile.pid, `-iTCP:${profile.port}`, '-sTCP:ESTABLISHED'];
  const result = runTolerantly(invocation, 'lsof', args);
  if (result.status === 0 && result.stdout.trim() !== '') return 'connected';
  if (result.status === 1 && result.stdout.trim() === '' && result.stderr.trim() === '') return 'idle';
  return 'unknown';
}

/** Returns the idle record's entries, or none when the record is absent or unreadable, which only delays a quit. */
function readIdleRecord(file: string): Map<string, IdleEntry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return new Map();
  }
  if (typeof parsed !== 'object' || parsed === null) return new Map();
  return new Map(Object.entries(parsed).filter((entry): entry is [string, IdleEntry] => isIdleEntry(entry[1])));
}

/** Replaces the idle record through a rename, so that a concurrent run never reads a partial file. */
function writeIdleRecord(file: string, entries: Map<string, IdleEntry>): void {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(Object.fromEntries(entries))}\n`);
  fs.renameSync(temporary, file);
}

// endregion | Helpers
