import { chmodSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { isRecord } from '@williamthorsen/toolbelt.objects';
import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';

/** A scratch machine whose `PATH` holds only a fake `uv`, and a reader of the calls that the fake received. */
export interface FakeUvMachine extends Disposable {
  /** The environment for `thor-image`: `PATH` holding the fake, and the preload that reports Apple Silicon. */
  readonly env: Record<string, string>;
  /** The arguments and the parsed stdin of each call, in order. */
  readonly readCalls: () => { args: string[]; request: unknown }[];
  readonly tree: TempTree;
}

/** The variable that makes the fake worker fail at the job with this index. */
export const FAKE_FAIL_AT = 'FAKE_FAIL_AT';

/**
 * Creates a machine whose fake `uv` acts as the worker: It reads the request on stdin, writes a placeholder PNG and
 * a `rendered` event per job, and logs its arguments and the request.
 */
export function createFakeUv(): FakeUvMachine {
  const tree = createTempTree({ 'bin/uv': `#!${process.execPath}\n${FAKE_UV_SOURCE}` });
  chmodSync(tree.resolve('bin/uv'), 0o755);
  return {
    env: {
      FAKE_LOG: tree.resolve('calls.jsonl'),
      NODE_OPTIONS: `--import=${PRETEND_APPLE_SILICON}`,
      PATH: tree.resolve('bin'),
    },
    readCalls: () => {
      const logPath = tree.resolve('calls.jsonl');
      if (!existsSync(logPath)) return [];
      return readFileSync(logPath, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line): unknown => JSON.parse(line))
        .filter(isFakeCall);
    },
    tree,
    [Symbol.dispose]: () => {
      tree[Symbol.dispose]();
    },
  };
}

// region | Helpers

/** Reports whether a logged value is a call of the fake. */
function isFakeCall(value: unknown): value is { args: string[]; request: unknown } {
  return isRecord(value) && Array.isArray(value['args']) && value['args'].every((arg) => typeof arg === 'string');
}

const PRETEND_APPLE_SILICON = path.join(import.meta.dirname, 'pretend-apple-silicon.ts');

const FAKE_UV_SOURCE = String.raw`const fs = require('node:fs');
const request = JSON.parse(fs.readFileSync(0, 'utf8'));
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args: process.argv.slice(2), request }) + '\n');
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\n');
emit({ event: 'started', mfluxVersion: '0.24.0' });
process.stderr.write('fake mflux: loading ' + request.model + '\n');
for (const [index, job] of request.jobs.entries()) {
  if (String(index) === process.env.FAKE_FAIL_AT) {
    emit({ event: 'failed', index, message: 'out of memory' });
    process.exit(1);
  }
  fs.writeFileSync(job.output, 'png');
  emit({ event: 'rendered', index, width: job.width ?? 1024, height: job.height ?? 1024, steps: 8 });
}
`;

// endregion | Helpers
