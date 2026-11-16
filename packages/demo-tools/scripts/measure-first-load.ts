// Measures a voice model's first load with the file cache cleared, or verifies that `voice setup` and `revoice`
// survive one. Run from `packages/demo-tools` after `nmr build`:
//
//   node scripts/measure-first-load.ts measure
//   node scripts/measure-first-load.ts verify <demo>
//
// Each run clears the file cache with `sudo purge`, which asks for a password, and writes its result as JSON under
// the voice home's `logs/`.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { readMachineConfig, type VoiceConfig } from '../src/config/read-machine-config.ts';
import { findFreePort } from '../src/portable/find-free-port.ts';
import { measureDirSize } from '../src/portable/measure-dir-size.ts';
import { postJson } from '../src/portable/post-json.ts';
import { resolveVoiceProfilePaths } from '../src/voice/build-voice-profile.ts';
import { buildServerLaunch, SERVER_HOST } from '../src/voice/mlx-audio/build-server-launch.ts';
import { buildSpeechRequest, SPEECH_PATH } from '../src/voice/mlx-audio/build-speech-request.ts';
import { formatModelDir } from '../src/voice/mlx-audio/format-model-dir.ts';
import { VERIFY_PHRASE } from '../src/voice/perform-voice-setup.ts';
import { startVoiceServer } from '../src/voice/voice-server.ts';

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..');

/** How long either measured request may take; long enough that only a hung server reaches it. */
const MEASURE_LIMIT_MS = 60 * 60 * 1000;

const [subcommand, demo] = process.argv.slice(2);
const voice = readVoice();
const result = subcommand === 'measure' ? await measure(voice) : verify(voice, demo);

const resultPath = path.join(voice.home, 'logs', `first-load-${subcommand}-${formatTimestamp(new Date())}.json`);
mkdirSync(path.dirname(resultPath), { recursive: true });
writeFileSync(resultPath, `${JSON.stringify(result, undefined, 2)}\n`);
console.log(JSON.stringify(result, undefined, 2));
console.log(`result: ${resultPath}`);

// region | Helpers

/** Writes `message` to stderr and exits 1. */
function fail(message: string): never {
  console.error(`measure-first-load: ${message}`);
  process.exit(1);
}

/** Formats `date` as `YYYYMMDD-HHMMSSZ`. */
function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
    .replace('T', '-');
}

/** Clears the file cache, then times the model's load and one synthesis, with the swap activity of each. */
async function measure(voice: VoiceConfig): Promise<Record<string, unknown>> {
  const modelDir = formatModelDir(voice.home, voice.model);
  const modelBytes = measureDirSize(modelDir);
  purgeFileCache();

  const launch = buildServerLaunch(voice.home, await findFreePort(SERVER_HOST));
  const started = await startVoiceServer(launch);
  if (!started.ok) fail(started.message);
  await using server = started.server;

  const load = await timeRequest(`${server.baseUrl}/v1/models?model_name=${encodeURIComponent(modelDir)}`, {});
  const profile = resolveVoiceProfilePaths(voice.home);
  const synthesis = await timeRequest(
    `${server.baseUrl}${SPEECH_PATH}`,
    buildSpeechRequest({
      input: VERIFY_PHRASE,
      modelDir,
      referenceAudio: profile.referenceAudio,
      referenceText: readFileSync(profile.transcript, 'utf8').trim(),
      sampling: voice.sampling,
    }),
  );

  return {
    model: voice.model,
    modelBytes,
    load,
    loadBytesPerMs: load.status === 200 ? Math.round(modelBytes / load.durationMs) : undefined,
    synthesis,
    serverLog: launch.logPath,
  };
}

/** Clears the file cache, so that the next read of the model comes from disk. */
function purgeFileCache(): void {
  console.log('clearing the file cache with sudo purge');
  const { status } = spawnSync('sudo', ['purge'], { stdio: 'inherit' });
  if (status !== 0) fail('sudo purge failed');
}

/** Reads the swap and page-out counters that `vm_stat` reports. */
function readSwapCounters(): { pageouts: number; swapouts: number } {
  const output = spawnSync('vm_stat', { encoding: 'utf8' }).stdout;
  function readCounter(label: string): number {
    const match = new RegExp(String.raw`^${label}:\s+(\d+)`, 'm').exec(output);
    return match?.[1] === undefined ? NaN : Number(match[1]);
  }
  return { pageouts: readCounter('Pageouts'), swapouts: readCounter('Swapouts') };
}

/** Reads the configured voice section, exiting when it is missing or invalid. */
function readVoice(): VoiceConfig {
  if (subcommand !== 'measure' && subcommand !== 'verify') fail('usage: measure-first-load.ts measure | verify <demo>');

  const config = readMachineConfig({ env: process.env, homeDir: os.homedir() });
  if (!config.ok) fail(config.message);
  if (!config.voice.ok) fail(config.voice.message);
  if (config.voice.voice === undefined) fail('the machine configuration does not have a voice section');
  return config.voice.voice;
}

/** POSTs `body` to `url`, returning the answer's status, the duration, and the swap activity during the request. */
async function timeRequest(
  url: string,
  body: unknown,
): Promise<{ durationMs: number; pageouts: number; status: number | string; swapouts: number }> {
  const before = readSwapCounters();
  const startedAt = Date.now();
  let status: number | string;
  try {
    status = (await postJson(url, body, AbortSignal.timeout(MEASURE_LIMIT_MS))).status;
  } catch (error) {
    status = describeError(error);
  }
  const durationMs = Date.now() - startedAt;
  const after = readSwapCounters();
  return {
    durationMs,
    pageouts: after.pageouts - before.pageouts,
    status,
    swapouts: after.swapouts - before.swapouts,
  };
}

/** Clears the file cache before each of `voice setup` and `revoice <demo>`, recording each one's outcome. */
function verify(voice: VoiceConfig, demo: string | undefined): Record<string, unknown> {
  if (demo === undefined) fail('verify takes the name of a recorded demo');

  const commands = [
    ['voice', 'setup'],
    ['revoice', demo],
  ];
  const outcomes = [];
  for (const args of commands) {
    purgeFileCache();
    const startedAt = Date.now();
    const { status } = spawnSync(process.execPath, [path.join(PACKAGE_DIR, 'bin/thor-demo.js'), ...args], {
      cwd: PACKAGE_DIR,
      stdio: 'inherit',
    });
    outcomes.push({ command: `thor-demo ${args.join(' ')}`, durationMs: Date.now() - startedAt, exitCode: status });
    if (status !== 0) break;
  }
  return { model: voice.model, outcomes };
}

// endregion | Helpers
