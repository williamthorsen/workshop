import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { routeCommand } from '../src/bin/route.ts';

/** A kit whose single check passes. */
const PASSING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;

/** A kit whose single error-severity check fails. */
const FAILING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'nope', check: () => false }] }] };\n`;

/** A kit that is not a valid kit at all, so loading it fails. */
const INVALID_KIT = `export default { nope: true };\n`;

let cwd: string;
let originalCwd: string;
let stdout: string[];
let stderr: string[];
let stdoutSpy: MockInstance;
let stderrSpy: MockInstance;

beforeAll(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(path.join(tmpdir(), 'readyup-exit-codes-'));
  mkdirSync(path.join(cwd, '.readyup/kits'), { recursive: true });
  writeFileSync(path.join(cwd, '.readyup/kits/passing.js'), PASSING_KIT);
  writeFileSync(path.join(cwd, '.readyup/kits/failing.js'), FAILING_KIT);
  writeFileSync(path.join(cwd, '.readyup/kits/invalid.js'), INVALID_KIT);
  // A manifest whose recorded hash cannot match the file on disk, so `verify` reports drift.
  writeFileSync(
    path.join(cwd, '.readyup/manifest.json'),
    JSON.stringify({
      version: 1,
      kits: [{ name: 'passing', path: 'kits/passing.js', targetHash: '0'.repeat(8) }],
    }),
  );
  // Compiling this drives real esbuild, which writes its own diagnostic straight to stderr; the
  // error banner that appears in an otherwise-passing test run belongs to this fixture.
  writeFileSync(path.join(cwd, 'broken.ts'), 'export default { this is not valid TypeScript\n');
  process.chdir(cwd);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

beforeEach(() => {
  stdout = [];
  stderr = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe('exit codes', () => {
  it.each([
    { label: 'a passing run', args: ['passing'], expected: 0 },
    { label: 'a failing run', args: ['failing'], expected: 1 },
    { label: 'verify drift', args: ['verify'], expected: 1 },
    { label: 'a kit that fails to compile', args: ['compile', 'broken.ts'], expected: 1 },
    { label: 'a bad flag', args: ['--bogus'], expected: 2 },
    { label: 'a missing kit', args: ['absent'], expected: 2 },
    { label: 'an unloadable kit', args: ['invalid'], expected: 2 },
    { label: 'an unreadable config', args: ['--from', 'https://example.com'], expected: 2 },
    { label: 'a missing manifest for verify', args: ['verify', '--manifest', 'absent.json'], expected: 2 },
    { label: 'listing an absent source', args: ['list', '--from', 'dir:/definitely/absent'], expected: 2 },
  ])('exits $expected for $label', async ({ args, expected }) => {
    await expect(routeCommand(args)).resolves.toBe(expected);
  });

  it.each([
    { label: 'a bad flag', args: ['--bogus'], code: 'usage' },
    { label: 'an unknown checklist', args: ['passing:absent'], code: 'usage' },
    { label: 'a missing kit', args: ['absent'], code: 'kit-load' },
    { label: 'an unloadable kit', args: ['invalid'], code: 'kit-load' },
  ])('reports code "$code" for $label', async ({ args, code }) => {
    const exitCode = await routeCommand([...args, '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(readStdout())).toStrictEqual({ error: { code, message: expect.any(String) } });
  });

  it('reports code "config" for an unreadable config file', async () => {
    // A separate tree, so the broken config does not reach the other cases in this file.
    const brokenCwd = mkdtempSync(path.join(tmpdir(), 'readyup-bad-config-'));
    mkdirSync(path.join(brokenCwd, '.config'), { recursive: true });
    writeFileSync(path.join(brokenCwd, '.config/readyup.config.ts'), 'export default { compile: 42 };\n');
    process.chdir(brokenCwd);

    try {
      const exitCode = await routeCommand(['--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(readStdout())).toStrictEqual({ error: { code: 'config', message: expect.any(String) } });
    } finally {
      process.chdir(cwd);
      rmSync(brokenCwd, { recursive: true, force: true });
    }
  });
});

describe('stdout purity under --json', () => {
  it.each([
    { label: 'a passing run', args: ['passing', '--json'] },
    { label: 'a failing run', args: ['failing', '--json'] },
    { label: 'a bad flag', args: ['--bogus', '--json'] },
    { label: 'a missing kit', args: ['absent', '--json'] },
    { label: 'an unknown command', args: ['compil', '--json'] },
    { label: 'a list failure', args: ['list', '--from', 'dir:/definitely/absent', '--json'] },
    { label: 'a verify failure', args: ['verify', '--manifest', 'absent.json', '--json'] },
    { label: 'an init usage error', args: ['init', '--json'] },
  ])('writes exactly one JSON document to stdout for $label', async ({ args }) => {
    await routeCommand(args);

    const written = readStdout();
    expect(() => {
      JSON.parse(written);
    }).not.toThrow();
    expect(written.trimEnd().includes('\n')).toBe(false);
  });

  it('keeps stderr empty when an error is reported through the envelope', async () => {
    await routeCommand(['--bogus', '--json']);

    expect(readStderr()).toBe('');
  });

  it('reports errors as prose on stderr when --json is absent', async () => {
    const exitCode = await routeCommand(['--bogus']);

    expect(exitCode).toBe(2);
    expect(readStderr()).toContain('Error:');
    expect(readStdout()).toBe('');
  });

  it.each([
    { label: 'the retired short flag', flag: '-j' },
    { label: 'a short cluster containing j', flag: '-jJ' },
  ])('takes the prose path for a flag-parse failure spelled with $label', async ({ flag }) => {
    const exitCode = await routeCommand([flag]);

    expect(exitCode).toBe(2);
    expect(readStdout()).toBe('');
    expect(readStderr()).toContain('Error:');
  });
});

describe('subcommand error classification', () => {
  it.each([
    { command: 'run', args: ['run', '--bogus'] },
    { command: 'list', args: ['list', '--bogus'] },
    { command: 'verify', args: ['verify', '--bogus'] },
    { command: 'compile', args: ['compile', '--bogus'] },
    { command: 'init', args: ['init', '--bogus'] },
  ])('exits 2 with a usage error for $command', async ({ args }) => {
    const exitCode = await routeCommand([...args, '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(readStdout())).toMatchObject({ error: { code: 'usage' } });
  });
});

/** Everything written to stdout during the current test. */
function readStdout(): string {
  return stdout.join('');
}

/** Everything written to stderr during the current test. */
function readStderr(): string {
  return stderr.join('');
}
