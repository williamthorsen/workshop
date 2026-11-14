import fs from 'node:fs';

import { captureOutput } from '../../test-utils/capture-output.ts';
import { runThorChrome } from '../thor-chrome.ts';
import type { FakeThorChrome } from './fake-thor-chrome.ts';

/** The last use that every profile reports in a transcript, at noon UTC, which is the same date from UTC-11 to UTC+11. */
const FROZEN_LAST_USED = new Date('2026-01-02T12:00:00Z');

/**
 * Runs thor-chrome against the fake, capturing this run alone, and returns its exit status, its stdout, its stderr,
 * and both streams in the order of their writes.
 *
 * Every profile's last use is set to `FROZEN_LAST_USED` before the run, and the fixture home reads `<home>`.
 */
export async function transcribe(fake: FakeThorChrome, args: string[]): Promise<string> {
  freezeProfiles(fake);
  const captured = captureOutput('thor-chrome');
  const status = await runThorChrome(args, captured.output, fake.deps);
  const transcript = [
    `$ ${args.join(' ')}`,
    `exit ${status}`,
    `--- stdout\n${captured.stdout()}`,
    `--- stderr\n${captured.stderr()}`,
    `--- combined\n${captured.combined()}`,
  ].join('\n');
  return transcript.replaceAll(fake.home, '<home>');
}

/**
 * Transcribes a run in prose and under `--json`. The second run reuses the fixture, so it suits only a command that
 * leaves the fixture as it found it.
 */
export async function transcribeBoth(fake: FakeThorChrome, args: string[]): Promise<string> {
  const prose = await transcribe(fake, args);
  const json = await transcribe(fake, [...args, '--json']);
  return `${prose}\n${json}`;
}

// region | Helpers

/** Sets the last use of every profile in the fake's profiles directory to `FROZEN_LAST_USED`. */
function freezeProfiles(fake: FakeThorChrome): void {
  if (!fs.existsSync(fake.profilesDir)) return;
  const entries = fs.readdirSync(fake.profilesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      fs.utimesSync(`${fake.profilesDir}/${entry.name}`, FROZEN_LAST_USED, FROZEN_LAST_USED);
    }
  }
}

// endregion | Helpers
