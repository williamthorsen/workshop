// Measures a voice model's first load with the file cache cleared, or right after a copy of the model has been
// written as a download writes it, or verifies that `voice setup` and `revoice` survive a first load. Run from
// `packages/demo-tools` after `nmr build`:
//
//   node scripts/measure-first-load.ts measure [--model <id>]
//   node scripts/measure-first-load.ts post-write [--model <id>]
//   node scripts/measure-first-load.ts verify <demo>
//
// `measure` and `verify` clear the file cache with `sudo purge`, which asks for a password. `post-write` writes its
// copy under the temporary directory and deletes it afterward. Each run writes its result as JSON under the voice
// home's `logs/`.

import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { readMachineConfig, type VoiceConfig } from '../src/config/read-machine-config.ts';
import { findFreePort } from '../src/portable/find-free-port.ts';
import { measureDirSize } from '../src/portable/measure-dir-size.ts';
import { resolveVoiceProfilePaths } from '../src/voice/build-voice-profile.ts';
import { buildServerLaunch, SERVER_HOST } from '../src/voice/mlx-audio/build-server-launch.ts';
import { buildSpeechRequest, SPEECH_PATH } from '../src/voice/mlx-audio/build-speech-request.ts';
import { formatModelDir } from '../src/voice/mlx-audio/format-model-dir.ts';
import { VERIFY_PHRASE } from '../src/voice/perform-voice-setup.ts';
import { startVoiceServer } from '../src/voice/voice-server.ts';

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..');

/** One phase of a request: how long it took, and the pages swapped and paged out meanwhile. */
interface PhaseTiming extends SwapCounters {
  readonly durationMs: number;
}

/** A speech request's timing: each phase's, or how far it got before it failed. */
type SpeechTiming =
  | {
      readonly body: PhaseTiming;
      readonly bytes: number;
      readonly headers: PhaseTiming;
      readonly status: number | undefined;
    }
  | { readonly error: string; readonly headers: PhaseTiming | undefined; readonly total: PhaseTiming };

/** The swap and page-out counters that `vm_stat` reports. */
interface SwapCounters {
  readonly pageouts: number;
  readonly swapouts: number;
}

/** How long either measured request may take; long enough that only a hung server reaches it. */
const MEASURE_LIMIT_MS = 60 * 60 * 1000;

const { positionals, values } = parseArgs({ allowPositionals: true, options: { model: { type: 'string' } } });
const [subcommand, demo] = positionals;
const voice = readVoice();
const model = values.model ?? voice.model;
const result =
  subcommand === 'measure'
    ? await measure(voice, model, { purge: true })
    : subcommand === 'post-write'
      ? await measureAfterWrite(voice, model)
      : verify(voice, demo);

const resultPath = path.join(voice.home, 'logs', `first-load-${subcommand}-${formatTimestamp(new Date())}.json`);
mkdirSync(path.dirname(resultPath), { recursive: true });
writeFileSync(resultPath, `${JSON.stringify(result, undefined, 2)}\n`);
console.log(JSON.stringify(result, undefined, 2));
console.log(`result: ${resultPath}`);

// region | Helpers

/** Copies every file under `sourceDir` into `targetDir` by reading and writing its bytes. */
async function copyFilesByStreaming(sourceDir: string, targetDir: string): Promise<void> {
  const entries = readdirSync(sourceDir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const source = path.join(entry.parentPath, entry.name);
    const target = path.join(targetDir, path.relative(sourceDir, source));
    mkdirSync(path.dirname(target), { recursive: true });
    await pipeline(createReadStream(source), createWriteStream(target));
  }
}

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

/**
 * Optionally clears the file cache, then sends two speech requests, timing each one's headers and body with the swap
 * activity of each phase. mlx-audio loads the model before it sends the headers, so the first request's headers mark
 * the load's end and the second request's body is a warm synthesis.
 */
async function measure(
  voice: VoiceConfig,
  model: string,
  { purge }: { readonly purge: boolean },
): Promise<Record<string, unknown>> {
  const modelDir = formatModelDir(voice.home, model);
  const modelBytes = measureDirSize(modelDir);
  if (purge) purgeFileCache();

  const launch = buildServerLaunch(voice.home, await findFreePort(SERVER_HOST));
  const started = await startVoiceServer(launch);
  if (!started.ok) fail(started.message);
  await using server = started.server;

  const profile = resolveVoiceProfilePaths(voice.home);
  const body = buildSpeechRequest({
    input: VERIFY_PHRASE,
    modelDir,
    referenceAudio: profile.referenceAudio,
    referenceText: readFileSync(profile.transcript, 'utf8').trim(),
    sampling: voice.sampling,
  });
  const cold = await timeSpeech(`${server.baseUrl}${SPEECH_PATH}`, body);
  const warm = await timeSpeech(`${server.baseUrl}${SPEECH_PATH}`, body);

  return {
    model,
    modelBytes,
    cold,
    loadBytesPerMs: cold.headers === undefined ? undefined : Math.round(modelBytes / cold.headers.durationMs),
    warm,
    serverLog: launch.logPath,
  };
}

/**
 * Writes a copy of the model's files under the temporary directory, streaming each file so that the file system
 * cannot clone it, then measures the installed model as `measure` does without clearing the cache, and deletes the
 * copy. The copy leaves memory as a download of the model leaves it.
 */
async function measureAfterWrite(voice: VoiceConfig, model: string): Promise<Record<string, unknown>> {
  const modelDir = formatModelDir(voice.home, model);
  const copyDir = mkdtempSync(path.join(os.tmpdir(), 'measure-first-load-'));
  try {
    const startedAt = Date.now();
    await copyFilesByStreaming(modelDir, copyDir);
    const writeMs = Date.now() - startedAt;
    console.log(`wrote a copy of ${model} in ${Math.round(writeMs / 1000)} s`);
    return { writeMs, ...(await measure(voice, model, { purge: false })) };
  } finally {
    rmSync(copyDir, { force: true, recursive: true });
  }
}

/** Clears the file cache, so that the next read of the model comes from disk. */
function purgeFileCache(): void {
  console.log('clearing the file cache with sudo purge');
  const { status } = spawnSync('sudo', ['purge'], { stdio: 'inherit' });
  if (status !== 0) fail('sudo purge failed');
}

/** Reads the swap and page-out counters that `vm_stat` reports. */
function readSwapCounters(): SwapCounters {
  const output = spawnSync('vm_stat', { encoding: 'utf8' }).stdout;
  function readCounter(label: string): number {
    const match = new RegExp(String.raw`^${label}:\s+(\d+)`, 'm').exec(output);
    return match?.[1] === undefined ? NaN : Number(match[1]);
  }
  return { pageouts: readCounter('Pageouts'), swapouts: readCounter('Swapouts') };
}

/** Reads the configured voice section, exiting when it is missing or invalid. */
function readVoice(): VoiceConfig {
  if (subcommand !== 'measure' && subcommand !== 'post-write' && subcommand !== 'verify') {
    fail('usage: measure-first-load.ts measure [--model <id>] | post-write [--model <id>] | verify <demo>');
  }

  const config = readMachineConfig({ env: process.env, homeDir: os.homedir() });
  if (!config.ok) fail(config.message);
  if (!config.voice.ok) fail(config.voice.message);
  if (config.voice.voice === undefined) fail('the machine configuration does not have a voice section');
  return config.voice.voice;
}

/**
 * POSTs `body` to `url`, returning the answer's status and, for the wait for the headers and for the body that
 * follows them, each one's duration and swap activity.
 */
async function timeSpeech(url: string, body: unknown): Promise<SpeechTiming> {
  const payload = JSON.stringify(body);
  const startCounters = readSwapCounters();
  const startedAt = Date.now();
  let headers: PhaseTiming | undefined;

  function measurePhase(since: number, counters: SwapCounters): PhaseTiming {
    const now = readSwapCounters();
    return {
      durationMs: Date.now() - since,
      pageouts: now.pageouts - counters.pageouts,
      swapouts: now.swapouts - counters.swapouts,
    };
  }

  try {
    return await new Promise<SpeechTiming>((resolve, reject) => {
      const request = http.request(
        url,
        {
          headers: { 'content-length': Buffer.byteLength(payload), 'content-type': 'application/json' },
          method: 'POST',
          signal: AbortSignal.timeout(MEASURE_LIMIT_MS),
        },
        (response) => {
          const headersTiming = measurePhase(startedAt, startCounters);
          headers = headersTiming;
          const bodyStartedAt = Date.now();
          const bodyCounters = readSwapCounters();
          let bytes = 0;
          response.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
          });
          response.once('error', reject);
          response.once('end', () => {
            resolve({
              body: measurePhase(bodyStartedAt, bodyCounters),
              bytes,
              headers: headersTiming,
              status: response.statusCode,
            });
          });
        },
      );
      request.once('error', reject);
      request.end(payload);
    });
  } catch (error) {
    return { error: describeError(error), headers, total: measurePhase(startedAt, startCounters) };
  }
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
