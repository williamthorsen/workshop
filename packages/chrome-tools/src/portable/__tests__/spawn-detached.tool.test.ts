import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

const MODULE = path.resolve(import.meta.dirname, '../spawn-detached.ts');

describe('spawnDetached', () => {
  it('lets the caller exit while the program runs, and writes its output to the emptied log', async () => {
    using tree = createTempTree({ 'program.log': 'earlier output\n' }, { prefix: 'thor-chrome-' });
    const log = tree.resolve('program.log');
    const script = `echo out; echo err >&2; sleep 1; echo late`;

    const started = Date.now();
    const result = runCaller(
      `spawnDetached('sh', ['-c', ${JSON.stringify(script)}], { logPath: ${JSON.stringify(log)} });`,
    );
    expect(result.status).toBe(0);
    expect(Date.now() - started).toBeLessThan(1000);

    await waitFor(() => fs.readFileSync(log, 'utf8').includes('late'));
    expect(fs.readFileSync(log, 'utf8')).toBe('out\nerr\nlate\n');
  });

  it('appends the reason to the log when the program cannot be started', async () => {
    using tree = createTempTree({}, { prefix: 'thor-chrome-' });
    const log = tree.resolve('program.log');
    const absent = tree.resolve('absent-program');

    const result = runCaller(`spawnDetached(${JSON.stringify(absent)}, [], { logPath: ${JSON.stringify(log)} });`);
    expect(result.status).toBe(0);
    await waitFor(() => fs.readFileSync(log, 'utf8') !== '');
    expect(fs.readFileSync(log, 'utf8')).toContain(`${absent}: spawn ${absent} ENOENT`);
  });
});

// region | Helpers

/** Runs a Node process that imports `spawnDetached` and evaluates `body`, and returns its status and output. */
function runCaller(body: string) {
  const source = `import { spawnDetached } from ${JSON.stringify(MODULE)};\n${body}\n`;
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8', timeout: 5000 });
}

/** Resolves once `condition` holds, polling for up to five seconds. */
async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition did not hold within 5s');
    // eslint-disable-next-line sky-pilot/no-real-time-sleep -- polls a real process; fake timers cannot advance it.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// endregion | Helpers
