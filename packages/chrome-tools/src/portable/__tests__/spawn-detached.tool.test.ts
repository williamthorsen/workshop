import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeFixtureDir } from '../../test-utils/fixture-dir.ts';

const MODULE = path.resolve(import.meta.dirname, '../spawn-detached.ts');

describe('spawnDetached', () => {
  it('lets the caller exit while the program runs, and writes its output to the emptied log', async () => {
    const dir = makeFixtureDir();
    const log = path.join(dir, 'program.log');
    fs.writeFileSync(log, 'earlier output\n');
    const script = `echo out; echo err >&2; sleep 1; echo late`;

    const started = Date.now();
    const result = runCaller(
      `spawnDetached('sh', ['-c', ${JSON.stringify(script)}], { logPath: ${JSON.stringify(log)} });`,
    );
    expect(result.status).toBe(0);
    expect(Date.now() - started).toBeLessThan(1_000);

    await waitFor(() => fs.readFileSync(log, 'utf8').includes('late'));
    expect(fs.readFileSync(log, 'utf8')).toBe('out\nerr\nlate\n');
  });

  it('appends the reason to the log when the program cannot be started', async () => {
    const dir = makeFixtureDir();
    const log = path.join(dir, 'program.log');
    const absent = path.join(dir, 'absent-program');

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
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8', timeout: 5_000 });
}

/** Resolves once `condition` holds, polling for up to five seconds. */
async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition did not hold within 5s');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// endregion | Helpers
