import { chmodSync } from 'node:fs';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';

const FAKE_NPM_SOURCE = String.raw`
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\n');

const [command] = args;
if (command === 'whoami') {
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
  process.exitCode = process.env.FAKE_NPM_PUBLISH === 'ok' ? 0 : 1;
}
`;

/**
 * Creates a fake `npm` that appends each call to a log and answers `whoami`, `view`, and `publish` as the behavior
 * sets, imitating npm 11's output: A missing package exits 1 with an `E404` JSON error on stdout.
 */
export function createFakeNpm(behavior: FakeNpmBehavior = {}): FakeNpm {
  const tree = createTempTree({ 'bin/npm': `#!${process.execPath}\n${FAKE_NPM_SOURCE}`, 'calls.jsonl': '' });
  chmodSync(tree.resolve('bin/npm'), 0o755);

  return {
    env: {
      FAKE_NPM_LOG: tree.resolve('calls.jsonl'),
      FAKE_NPM_PUBLISH: behavior.publish ?? 'ok',
      FAKE_NPM_VIEW: behavior.view ?? 'absent',
      FAKE_NPM_WHOAMI: behavior.whoami ?? 'ok',
      PATH: tree.resolve('bin'),
    },
    readCalls: () =>
      tree
        .read('calls.jsonl')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => parseCall(line)),
    tree,
    [Symbol.dispose]() {
      tree[Symbol.dispose]();
    },
  };
}

/** A scratch directory holding a fake `npm`, with readers for what the fake observed. */
export interface FakeNpm extends Disposable {
  /** The environment for the client: `PATH` holding only the fake, and the fake's settings. */
  readonly env: NodeJS.ProcessEnv;
  readonly readCalls: () => FakeNpmCall[];
  readonly tree: TempTree;
}

/** How the fake answers each subcommand. */
export interface FakeNpmBehavior {
  readonly publish?: 'fail' | 'ok';
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

  return (
    Array.isArray(value.args) && value.args.every((arg) => typeof arg === 'string') && typeof value.cwd === 'string'
  );
}

/** Parses one logged call. */
function parseCall(line: string): FakeNpmCall {
  const parsed: unknown = JSON.parse(line);
  if (!isFakeNpmCall(parsed)) throw new Error(`Unexpected fake npm log line: ${line}`);

  return parsed;
}

// endregion | Helpers
