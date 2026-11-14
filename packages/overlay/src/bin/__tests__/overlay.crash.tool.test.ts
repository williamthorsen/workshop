import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

const ENTRY_POINT = path.join(import.meta.dirname, '../overlay.ts');

// The entry calls `process.exit` outside `run`, whose own catch would otherwise report the probe as a handled error.
// Only the first call throws, so that the handler's own exit ends the process.
const PRELOAD = [
  "import process from 'node:process';",
  'const exit = process.exit.bind(process);',
  'let isFirstCall = true;',
  'process.exit = (code) => {',
  '  if (!isFirstCall) return exit(code);',
  '  isFirstCall = false;',
  "  throw new Error('exit probe');",
  '};',
  '',
].join('\n');

describe('overlay on an unanticipated throw', () => {
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
    expect(stderr).toMatch(/^overlay: internal error: exit probe\n\s+at /m);
  });
});
