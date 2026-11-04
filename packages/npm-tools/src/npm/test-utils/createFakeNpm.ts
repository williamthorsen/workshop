import { chmodSync } from 'node:fs';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';

const FAKE_NPM_SOURCE = String.raw`
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\n');

const [command, subcommand] = args;
if (command === '--version') {
  process.stdout.write('11.0.0\n');
} else if (command === 'whoami') {
  if (process.env.FAKE_NPM_WHOAMI === 'ok') {
    process.stdout.write('someone\n');
  } else {
    process.stderr.write('npm error code ENEEDAUTH\nnpm error need auth This command requires you to be logged in.\n');
    process.exitCode = 1;
  }
} else if (command === 'view') {
  const mode = process.env.FAKE_NPM_VIEW;
  if (mode === 'found') {
    process.stdout.write('"1.0.0"\n');
  } else if (mode === 'absent') {
    process.stdout.write(JSON.stringify({ error: { code: 'E404', summary: 'Not Found' } }) + '\n');
    process.stderr.write('npm error code E404\nnpm error 404 Not Found\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(JSON.stringify({ error: { code: 'ECONNREFUSED', summary: 'request failed' } }) + '\n');
    process.stderr.write('npm error code ECONNREFUSED\nnpm error request to registry failed\nnpm error A complete log of this run can be found in: /tmp/x.log\n');
    process.exitCode = 1;
  }
} else if (command === 'publish') {
  const mode = process.env.FAKE_NPM_PUBLISH;
  if (mode === 'interrupt') {
    // A Ctrl+C at a terminal signals the whole foreground process group, the client's process included.
    process.kill(process.ppid, 'SIGINT');
    process.kill(process.pid, 'SIGINT');
  }
  process.exitCode = mode === 'ok' ? 0 : 1;
} else if (command === 'trust' && subcommand === 'list') {
  const listing = process.env.FAKE_NPM_TRUST_LIST;
  if (listing === 'fail') {
    process.stdout.write('npm error code E403\nnpm error 403 Forbidden - GET https://registry.npmjs.org/-/package/x/trust\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(listing);
  }
} else if (command === 'trust' && subcommand === 'revoke') {
  process.exitCode = process.env.FAKE_NPM_TRUST_REVOKE === 'ok' ? 0 : 1;
} else if (command === 'trust' && subcommand === 'github') {
  process.exitCode = process.env.FAKE_NPM_TRUST_GITHUB === 'ok' ? 0 : 1;
}
`;

// Imitates script(1) in both of the forms that the client uses: It runs the command with stdout recorded to the file
// with CRLF line endings, as a pseudo-terminal records it, and exits with the command's status.
const FAKE_SCRIPT_SOURCE = String.raw`
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_SCRIPT_LOG, JSON.stringify(args) + '\n');

let file;
let result;
if (args[0] === '-q') {
  file = args[1];
  result = spawnSync(args[2], args.slice(3), { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
} else if (args[0] === '--quiet' && args[1] === '--return' && args[2] === '--command') {
  file = args[4];
  result = spawnSync('/bin/sh', ['-c', args[3]], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
} else {
  process.stderr.write('fake script: unexpected arguments\n');
  process.exit(64);
}
fs.writeFileSync(file, result.stdout.replaceAll('\n', '\r\n'));
process.exitCode = result.status ?? 1;
`;

/**
 * Creates a fake `npm` that appends each call to a log and answers `--version`, `whoami`, `view`, `publish`, and
 * `trust` as the behavior sets, imitating npm 11's output: A missing package exits 1 with an `E404` JSON error on
 * stdout. Beside it, unless the behavior omits it, is a fake `script` that logs its arguments.
 */
export function createFakeNpm(behavior: FakeNpmBehavior = {}): FakeNpm {
  const tree = createTempTree({
    'bin/npm': `#!${process.execPath}\n${FAKE_NPM_SOURCE}`,
    ...(behavior.script !== false && { 'bin/script': `#!${process.execPath}\n${FAKE_SCRIPT_SOURCE}` }),
    'calls.jsonl': '',
    'script-calls.jsonl': '',
  });
  chmodSync(tree.resolve('bin/npm'), 0o755);
  if (behavior.script !== false) chmodSync(tree.resolve('bin/script'), 0o755);

  return {
    env: {
      FAKE_NPM_LOG: tree.resolve('calls.jsonl'),
      FAKE_NPM_PUBLISH: behavior.publish ?? 'ok',
      FAKE_NPM_TRUST_GITHUB: behavior.trustGithub ?? 'ok',
      FAKE_NPM_TRUST_LIST: behavior.trustList ?? '',
      FAKE_NPM_TRUST_REVOKE: behavior.trustRevoke ?? 'ok',
      FAKE_NPM_VIEW: behavior.view ?? 'absent',
      FAKE_NPM_WHOAMI: behavior.whoami ?? 'ok',
      FAKE_SCRIPT_LOG: tree.resolve('script-calls.jsonl'),
      PATH: tree.resolve('bin'),
    },
    readCalls: () => readLines(tree, 'calls.jsonl').map((line) => parseCall(line)),
    readScriptCalls: () => readLines(tree, 'script-calls.jsonl').map((line) => parseScriptCall(line)),
    tree,
    [Symbol.dispose]() {
      tree[Symbol.dispose]();
    },
  };
}

/** A scratch directory holding a fake `npm` and `script`, with readers for what the fakes observed. */
export interface FakeNpm extends Disposable {
  /** The environment for the client: `PATH` holding only the fakes, and the fakes' settings. */
  readonly env: NodeJS.ProcessEnv;
  readonly readCalls: () => FakeNpmCall[];
  /** Returns the arguments of each `script` invocation. */
  readonly readScriptCalls: () => string[][];
  readonly tree: TempTree;
}

/**
 * How the fake answers each subcommand. `trustList` is the text that `npm trust list` writes, or `fail`; `script:
 * false` leaves the fake `script` out.
 */
export interface FakeNpmBehavior {
  readonly publish?: 'fail' | 'interrupt' | 'ok';
  readonly script?: boolean;
  readonly trustGithub?: 'fail' | 'ok';
  readonly trustList?: string;
  readonly trustRevoke?: 'fail' | 'ok';
  readonly view?: 'absent' | 'fail' | 'found';
  readonly whoami?: 'fail' | 'ok';
}

/** What the fake observed on one invocation. */
export interface FakeNpmCall {
  readonly args: string[];
  readonly cwd: string;
}

// region | Helpers

/** Reports whether a parsed value is a logged call. */
function isFakeNpmCall(value: unknown): value is FakeNpmCall {
  if (typeof value !== 'object' || value === null) return false;
  if (!('args' in value) || !('cwd' in value)) return false;

  return isStringArray(value.args) && typeof value.cwd === 'string';
}

/** Reports whether a value is an array of strings. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Parses one logged call. */
function parseCall(line: string): FakeNpmCall {
  const parsed: unknown = JSON.parse(line);
  if (!isFakeNpmCall(parsed)) throw new Error(`Unexpected fake npm log line: ${line}`);

  return parsed;
}

/** Parses one logged `script` invocation. */
function parseScriptCall(line: string): string[] {
  const parsed: unknown = JSON.parse(line);
  if (!isStringArray(parsed)) throw new Error(`Unexpected fake script log line: ${line}`);

  return parsed;
}

/** Reads the non-empty lines of a log in the tree. */
function readLines(tree: TempTree, file: string): string[] {
  return tree
    .read(file)
    .split('\n')
    .filter((line) => line !== '');
}

// endregion | Helpers
