import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

const sourceCli = path.resolve(import.meta.dirname, '../rdy.ts');

const HINT = 'A check that starts async work must await it or return it.';

/**
 * Kits whose one check leaks a failure and then passes.
 *
 * Each failure settles before the check returns, because the process exits as soon as the run ends.
 */
const ESCAPED_FAILURES = [
  {
    label: 'a leaked rejection',
    message: 'leaked rejection',
    kit: buildLeakingKit(`void Promise.reject(new Error('leaked rejection'));`),
  },
  {
    label: 'an exception thrown from a timer',
    message: 'timer throw',
    kit: buildLeakingKit(`setTimeout(() => { throw new Error('timer throw'); }, 0);`),
  },
];

// Drives the real CLI, because a test runner in the same process installs its own listeners for these events.
describe('rdy, spawned, when a failure escapes every awaited call', () => {
  it.for(ESCAPED_FAILURES)('reports $label as prose on stderr and exits 2', ({ kit, message }) => {
    using tree = createTempTree({ 'kit.js': kit }, { prefix: 'readyup-escaped-failure-' });

    const result = spawnRdy(['run', '--file', tree.resolve('kit.js')], tree.dir);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Error: Nothing awaited this failure: ${message}\n`);
    expect(result.stderr).toContain(HINT);
    expect(result.stderr).not.toMatch(/^\s+at /m);
  });

  it.for(ESCAPED_FAILURES)('reports $label as one error envelope under --json and exits 2', ({ kit, message }) => {
    using tree = createTempTree({ 'kit.js': kit }, { prefix: 'readyup-escaped-failure-' });

    const result = spawnRdy(['run', '--json', '--file', tree.resolve('kit.js')], tree.dir);

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toStrictEqual({
      schemaVersion: 1,
      error: { code: 'internal', message: `Nothing awaited this failure: ${message}`, hint: HINT },
    });
    expect(result.stderr).toBe('');
  });
});

// region | Helpers

/** Returns the source of a kit whose one check runs `leak`, then passes 50 ms later. */
function buildLeakingKit(leak: string): string {
  return [
    'export default {',
    '  checklists: [{',
    "    name: 'main',",
    '    checks: [{',
    "      name: 'leaks',",
    '      check: () => {',
    `        ${leak}`,
    '        return new Promise((resolve) => setTimeout(() => resolve(true), 50));',
    '      },',
    '    }],',
    '  }],',
    '};',
    '',
  ].join('\n');
}

/** Runs the source CLI with `args` from `cwd`, capturing its exit status and both streams. */
function spawnRdy(args: string[], cwd: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [sourceCli, ...args], { cwd, encoding: 'utf8' });
}

// endregion | Helpers
