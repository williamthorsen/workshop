import { readFileSync } from 'node:fs';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';

/** What the fake aidemo observed on one invocation. */
export interface FakeAidemoCall {
  readonly args: string[];
  readonly cwd: string;
  /** The `AIDEMO_*` and `OPENAI_*` variables that were set. */
  readonly env: Record<string, string>;
}

/** How the fake aidemo behaves, and what else the repository contains. */
export interface DemoRepoOptions {
  /** The repository configuration file's content. */
  readonly config?: string;
  /** The content of a `.env` at the root, when given. */
  readonly envFile?: string;
  readonly exitCode?: number;
  /** Files, keyed by name, that the fake writes to the demo's `output/` on `render`. */
  readonly outputFiles?: Readonly<Record<string, string>>;
  /** Text that the fake writes to stdout. */
  readonly stdout?: string;
  /** Leaves the fake aidemo uninstalled. */
  readonly withoutAidemo?: boolean;
}

/** A scratch demo repository with one demo, `quickstart`, and a reader for the fake aidemo's calls. */
export interface DemoRepo extends Disposable {
  readonly readCalls: () => FakeAidemoCall[];
  readonly tree: TempTree;
}

/** The line that the fake writes to stderr when it starts, which marks what `thor-demo` wrote before it. */
export const FAKE_AIDEMO_STARTED = 'fake aidemo started';

const AIDEMO_DIR = 'node_modules/@tandryukha/aidemo';

const CALLS_FILE = 'aidemo-calls.jsonl';

/**
 * Creates a demo repository whose installed aidemo is a fake that appends each call to a log, writes `stdout` and, on
 * `render`, `outputFiles`, and exits with `exitCode`.
 */
export function createDemoRepo(options: DemoRepoOptions = {}): DemoRepo {
  const { config = '', envFile, exitCode = 0, outputFiles = {}, stdout = '', withoutAidemo = false } = options;
  const tree = createTempTree({
    '.config/thor-demo.yaml': config,
    'demos/quickstart/generated/storyboard.json': '{}',
    'package.json': '{}',
    ...(envFile !== undefined && { '.env': envFile }),
    ...(!withoutAidemo && {
      [`${AIDEMO_DIR}/package.json`]: JSON.stringify({ version: '0.20.0', bin: { aidemo: 'bin/aidemo.mjs' } }),
      [`${AIDEMO_DIR}/bin/aidemo.mjs`]: buildFakeScript(CALLS_FILE, stdout, exitCode, outputFiles),
    }),
  });

  return {
    readCalls: () => readCalls(tree),
    tree,
    [Symbol.dispose]: () => {
      tree[Symbol.dispose]();
    },
  };
}

// region | Helpers

/** Returns the source of the fake aidemo, which records its call in `callsFile` at the repository root. */
function buildFakeScript(
  callsFile: string,
  stdout: string,
  exitCode: number,
  outputFiles: Readonly<Record<string, string>>,
): string {
  return `import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { EOL } from 'node:os';
import path from 'node:path';

process.stderr.write(${JSON.stringify(`${FAKE_AIDEMO_STARTED}\n`)});
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name.startsWith('AIDEMO_') || name.startsWith('OPENAI_')),
);
const call = { args: process.argv.slice(2), cwd: process.cwd(), env };
appendFileSync(path.join(import.meta.dirname, '../../../..', ${JSON.stringify(callsFile)}), JSON.stringify(call) + EOL);
if (call.args[0] === 'render') {
  const outputDir = path.join(call.args[1], 'output');
  mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of Object.entries(${JSON.stringify(outputFiles)})) {
    writeFileSync(path.join(outputDir, name), content);
  }
}
process.stdout.write(${JSON.stringify(stdout)});
process.exitCode = ${String(exitCode)};
`;
}

/** Reads the fake's recorded calls, in order. */
function readCalls(tree: TempTree): FakeAidemoCall[] {
  if (!tree.exists(CALLS_FILE)) return [];

  return readFileSync(tree.resolve(CALLS_FILE), 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => parseCall(line));
}

/** Parses one recorded call, which the fake wrote with the shape of `FakeAidemoCall`. */
function parseCall(line: string): FakeAidemoCall {
  const parsed: unknown = JSON.parse(line);
  if (!isCall(parsed)) throw new Error(`unexpected fake aidemo record: ${line}`);

  return parsed;
}

/** Reports whether a parsed record has the shape of a call. */
function isCall(value: unknown): value is FakeAidemoCall {
  if (typeof value !== 'object' || value === null) return false;

  return (
    'args' in value && Array.isArray(value.args) && 'cwd' in value && typeof value.cwd === 'string' && 'env' in value
  );
}

// endregion | Helpers
