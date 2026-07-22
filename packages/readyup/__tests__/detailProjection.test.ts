import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { routeCommand } from '../src/bin/route.ts';

/** A kit with one passing check and one failing check that carries a fix. */
const MIXED_KIT =
  `export default { checklists: [{ name: 'main', checks: [\n` +
  `  { name: 'clean', check: () => true },\n` +
  `  { name: 'nope', check: () => false, fix: 'do the thing' },\n` +
  `] }] };\n`;

let cwd: string;
let originalCwd: string;
let stdout: string[];
let stdoutSpy: MockInstance;
let stderrSpy: MockInstance;

beforeAll(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(path.join(tmpdir(), 'readyup-detail-'));
  mkdirSync(path.join(cwd, '.readyup/kits'), { recursive: true });
  writeFileSync(path.join(cwd, '.readyup/kits/default.js'), MIXED_KIT);
  process.chdir(cwd);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

beforeEach(() => {
  stdout = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

function readStdout(): string {
  return stdout.join('');
}

describe('--detail projection', () => {
  it('defaults to the full tree, echoing the projection it used', async () => {
    await routeCommand(['--json']);

    expect(JSON.parse(readStdout())).toMatchObject({
      detail: 'full',
      kits: [{ checklists: [{ checks: [{ name: 'clean' }, { name: 'nope' }] }] }],
    });
  });

  it('reduces the tree to failed checks and their fixes under summary', async () => {
    await routeCommand(['--json', '--detail', 'summary']);

    expect(JSON.parse(readStdout())).toMatchObject({
      detail: 'summary',
      counts: { passed: 1, errors: 1 },
      worstSeverity: 'error',
      kits: [{ checklists: [{ checks: [{ name: 'nope', fix: 'do the thing' }] }] }],
    });
    expect(readStdout()).not.toContain('clean');
  });

  it('reports --detail without --json as a usage error rather than ignoring it', async () => {
    const exitCode = await routeCommand(['--detail', 'summary']);

    expect(exitCode).toBe(2);
    expect(readStdout()).toBe('');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('--detail requires --json'));
  });

  it.each(['compile', 'init', 'list', 'verify'])('reports --detail on %s as a usage error', async (command) => {
    const exitCode = await routeCommand([command, '--detail', 'summary', '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(readStdout())).toMatchObject({ error: { code: 'usage' } });
  });
});
