import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

const ENTRY_POINT = path.join(import.meta.dirname, '../thor-jira.ts');

const PRELOAD = [
  "import process from 'node:process';",
  "process.stdout.write = () => { throw new Error('stdout probe'); };",
  '',
].join('\n');

describe('thor-jira on an unanticipated throw', () => {
  it('reports an internal error with its stack frames and exits 1', () => {
    using tree = createTempTree({ 'preload.mjs': PRELOAD });

    const { status, stderr } = spawnSync(
      process.execPath,
      ['--import', tree.resolve('preload.mjs'), ENTRY_POINT, '--help'],
      {
        cwd: tree.dir,
        encoding: 'utf8',
        env: { ...process.env, HOME: tree.dir },
      },
    );

    expect(status).toBe(1);
    expect(stderr).toMatch(/^thor-jira: internal error: stdout probe\n\s+at /m);
  });
});
