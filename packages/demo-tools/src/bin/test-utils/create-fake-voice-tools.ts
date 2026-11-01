import { chmodSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';

import { isRecord } from '../../portable/is-record.ts';

/** What a fake tool observed on one invocation. */
export interface FakeToolCall {
  readonly args: string[];
  /** The Hugging Face variables that were set. */
  readonly env: Record<string, string>;
  readonly tool: string;
}

/** What the fake speech server received on one request. */
export interface FakeSpeechRequest {
  readonly body: Record<string, unknown>;
  /** The address on which the server was listening. */
  readonly host: string;
}

/** A scratch machine with fake voice tools, and readers for what the fakes observed. */
export interface FakeVoiceMachine extends Disposable {
  /** The environment for `thor-demo`: `PATH` holding only the fakes, and `HOME`. */
  readonly env: Record<string, string>;
  readonly readCalls: () => FakeToolCall[];
  readonly readServerPid: () => number | undefined;
  readonly readSpeechRequests: () => FakeSpeechRequest[];
  readonly tree: TempTree;
  /** The install location that the configuration sets. */
  readonly voiceHome: string;
}

/** The variable that sets the fake speech server's response status. */
export const FAKE_SPEECH_STATUS = 'FAKE_SPEECH_STATUS';

/** The variable that sets the peak level, in dB, that the fake ffmpeg reports for a recording. */
export const FAKE_PEAK_DB = 'FAKE_PEAK_DB';

/** The variable that delays the fake speech server's response, in milliseconds. */
export const FAKE_SPEECH_DELAY_MS = 'FAKE_SPEECH_DELAY_MS';

const PRETEND_APPLE_SILICON = path.join(import.meta.dirname, 'pretend-apple-silicon.ts');

/**
 * Creates a machine whose home has a machine configuration with a `voice` section and a reference recording, and
 * whose `PATH` holds fake `afplay`, `ffmpeg`, `swiftc`, and `uv`. The fake `uv venv` writes a fake `python` and `hf`
 * into the virtual environment, the fake `python -m mlx_audio.server` serves the speech endpoint, and the fake
 * `swiftc` writes a fake recorder. Each fake appends its call to a
 * log. `NODE_OPTIONS` makes `thor-demo` report Apple Silicon whatever the host.
 */
export function createFakeVoiceTools({
  model,
  withoutReference = false,
}: { model?: string; withoutReference?: boolean } = {}): FakeVoiceMachine {
  const tree = createTempTree({
    'bin/afplay': buildScript(AFPLAY_SOURCE),
    'bin/ffmpeg': buildScript(FFMPEG_SOURCE),
    'bin/swiftc': buildScript(SWIFTC_SOURCE),
    'bin/uv': buildScript(UV_SOURCE),
    'home/.config/thor-demo/config.yaml': buildVoiceConfig(model),
    ...(!withoutReference && { 'home/reference.m4a': 'audio' }),
    'home/reference.txt': 'Hello there.\n',
  });
  for (const tool of ['afplay', 'ffmpeg', 'swiftc', 'uv']) chmodSync(tree.resolve(`bin/${tool}`), 0o755);

  return {
    env: {
      FAKE_LOG_DIR: tree.dir,
      HOME: tree.resolve('home'),
      NODE_OPTIONS: `--import=${PRETEND_APPLE_SILICON}`,
      PATH: tree.resolve('bin'),
    },
    readCalls: () => readJsonLines(tree.resolve('calls.jsonl')).filter(isFakeToolCall),
    readServerPid: () => {
      const pidPath = tree.resolve('server.pid');
      return existsSync(pidPath) ? Number(readFileSync(pidPath, 'utf8')) : undefined;
    },
    readSpeechRequests: () => readJsonLines(tree.resolve('requests.jsonl')).filter(isFakeSpeechRequest),
    tree,
    voiceHome: tree.resolve('home/voice'),
    [Symbol.dispose]: () => {
      tree[Symbol.dispose]();
    },
  };
}

/** Returns a machine configuration whose voice section installs under `~/voice`, with `model` when given. */
export function buildVoiceConfig(model?: string): string {
  const modelLine = model === undefined ? '' : `  model: ${model}\n`;
  return `voice:\n  home: ~/voice\n${modelLine}  reference:\n    audio: ~/reference.m4a\n    transcript: ~/reference.txt\n`;
}

// region | Helpers

/** Prefixes CommonJS source with a shebang that runs it with this node. */
function buildScript(source: string): string {
  return `#!${process.execPath}\n${LOG_SOURCE}\n${source}`;
}

/** Reports whether a logged value is a fake speech request. */
function isFakeSpeechRequest(value: unknown): value is FakeSpeechRequest {
  return isRecord(value) && isRecord(value['body']) && typeof value['host'] === 'string';
}

/** Reports whether a logged value is a fake tool call. */
function isFakeToolCall(value: unknown): value is FakeToolCall {
  return isRecord(value) && Array.isArray(value['args']) && isRecord(value['env']) && typeof value['tool'] === 'string';
}

/** Parses each line of a JSON Lines file, or returns an empty list when the file is missing. */
function readJsonLines(filePath: string): unknown[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

// The fakes log to FAKE_LOG_DIR, which reaches them through the environment that thor-demo passes on.
const LOG_SOURCE = String.raw`const fs = require('node:fs');
const path = require('node:path');
function log(tool) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(HF_|TRANSFORMERS_)/.test(name)));
  fs.appendFileSync(path.join(process.env.FAKE_LOG_DIR, 'calls.jsonl'), JSON.stringify({ tool, args: process.argv.slice(2), env }) + '\n');
}`;

const AFPLAY_SOURCE = `log('afplay');
`;

// Measuring reports fixed levels; converting copies the input, so that a test can follow a take to its destination.
const FFMPEG_SOURCE = `log('ffmpeg');
const args = process.argv.slice(2);
if (args.includes('volumedetect')) {
  console.error('  Duration: 00:00:12.50, bitrate: 768 kb/s');
  console.error('[Parsed_volumedetect_0] mean_volume: -24.0 dB');
  console.error('[Parsed_volumedetect_0] max_volume: ' + (process.env.${FAKE_PEAK_DB} ?? '-6.0') + ' dB');
} else {
  const input = args[args.indexOf('-i') + 1];
  fs.writeFileSync(args.at(-1), fs.existsSync(input) ? fs.readFileSync(input) : 'RIFFfake');
}
`;

const RECORDER_SOURCE = String.raw`log('recorder');
const [mode, , output] = process.argv.slice(2);
if (mode === 'list') console.log('Desk Mic\nLaptop Mic');
else fs.writeFileSync(output, 'RIFFtake');
`;

const SWIFTC_SOURCE = String.raw`log('swiftc');
const output = process.argv[process.argv.indexOf('-o') + 1];
fs.writeFileSync(output, fs.readFileSync(__filename, 'utf8').split('\n')[0] + '\n' + ${JSON.stringify(LOG_SOURCE)} + '\n' + ${JSON.stringify(RECORDER_SOURCE)});
fs.chmodSync(output, 0o755);
`;

const HF_SOURCE = `log('hf');
const dir = process.argv[process.argv.indexOf('--local-dir') + 1];
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'config.json'), '{}');
`;

const PYTHON_SOURCE = String.raw`log('python');
const http = require('node:http');
const host = process.argv[process.argv.indexOf('--host') + 1];
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
fs.writeFileSync(path.join(process.env.FAKE_LOG_DIR, 'server.pid'), String(process.pid));
http.createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/v1/audio/speech') {
    response.statusCode = 404;
    response.end();
    return;
  }
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    fs.appendFileSync(path.join(process.env.FAKE_LOG_DIR, 'requests.jsonl'), JSON.stringify({ body: JSON.parse(body), host }) + '\n');
    setTimeout(() => {
      response.statusCode = Number(process.env.${FAKE_SPEECH_STATUS} ?? 200);
      response.setHeader('content-type', 'audio/mp3');
      response.end('ID3fake');
    }, Number(process.env.${FAKE_SPEECH_DELAY_MS} ?? 0));
  });
}).listen(port, host);
`;

const UV_SOURCE = String.raw`log('uv');
if (process.argv[2] === 'venv') {
  const bin = path.join(process.argv.at(-1), 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const [name, source] of [['python', ${JSON.stringify(PYTHON_SOURCE)}], ['hf', ${JSON.stringify(HF_SOURCE)}]]) {
    const file = path.join(bin, name);
    fs.writeFileSync(file, fs.readFileSync(__filename, 'utf8').split('\n')[0] + '\n' + ${JSON.stringify(LOG_SOURCE)} + '\n' + source);
    fs.chmodSync(file, 0o755);
  }
}
`;

// endregion | Helpers
