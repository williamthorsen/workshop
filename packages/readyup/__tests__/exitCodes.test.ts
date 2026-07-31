import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect } from 'vitest';

import { routeCommand } from '../src/bin/route.ts';
import { type CapturedStdio, createStdioFixture } from './helpers/capturedStdio.ts';
import { createTempDirTest } from './helpers/tempDir.ts';

/** A kit whose single check passes. */
const PASSING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;

/** A kit whose single error-severity check fails. */
const FAILING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'nope', check: () => false }] }] };\n`;

/** A kit that is not a valid kit at all, so loading it fails. */
const INVALID_KIT = `export default { nope: true };\n`;

/** A kit with three named checklists, for exercising checklist selection. */
const MULTI_KIT =
  `export default { checklists: [\n` +
  `  { name: 'build', checks: [{ name: 'build-ok', check: () => true }] },\n` +
  `  { name: 'test', checks: [{ name: 'test-ok', check: () => true }] },\n` +
  `  { name: 'lint', checks: [{ name: 'lint-ok', check: () => true }] },\n` +
  `] };\n`;

const it = createTempDirTest({
  prefix: 'readyup-exit-codes-',
  cwd: 'chdir',
  scope: 'file',
  setup: (temp) => {
    temp.write('.readyup/kits/passing.js', PASSING_KIT);
    temp.write('.readyup/kits/failing.js', FAILING_KIT);
    temp.write('.readyup/kits/invalid.js', INVALID_KIT);
    temp.write('.readyup/kits/deploy.js', MULTI_KIT);
    // A manifest whose recorded hash cannot match the file on disk, so `verify` reports drift.
    temp.writeJson('.readyup/manifest.json', {
      version: 1,
      kits: [{ name: 'passing', path: 'kits/passing.js', targetHash: '0'.repeat(8) }],
    });
    // Compiling this drives real esbuild, which writes its own diagnostic straight to stderr; the
    // error banner that appears in an otherwise-passing test run belongs to this fixture.
    temp.write('broken.ts', 'export default { this is not valid TypeScript\n');
  },
}).extend<{ io: CapturedStdio }>({ io: createStdioFixture() });

describe('exit codes', () => {
  it.for([
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

  it('reports a pre-dispatch failure through the error envelope', async ({ io }) => {
    const exitCode = await routeCommand(['--bogus', '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stdout)).toStrictEqual({
      schemaVersion: 1,
      error: { code: 'usage', message: expect.any(String) },
    });
  });

  it.for([
    { label: 'an unknown checklist', args: ['passing:absent'], kit: 'passing', code: 'usage' },
    { label: 'a missing kit', args: ['absent'], kit: 'absent', code: 'kit-load' },
    { label: 'an unloadable kit', args: ['invalid'], kit: 'invalid', code: 'kit-load' },
  ])('reports code "$code" as a per-kit error entry for $label', async ({ args, kit, code }, { io }) => {
    const exitCode = await routeCommand([...args, '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stdout)).toMatchObject({
      kits: [{ name: kit, error: { code, message: expect.any(String) } }],
    });
  });

  it('reports code "config" for an unreadable config file', async ({ io, temp }) => {
    // A separate tree, so the broken config does not reach the other cases in this file.
    const brokenCwd = mkdtempSync(path.join(tmpdir(), 'readyup-bad-config-'));
    mkdirSync(path.join(brokenCwd, '.config'), { recursive: true });
    writeFileSync(path.join(brokenCwd, '.config/readyup.config.ts'), 'export default { compile: 42 };\n');
    process.chdir(brokenCwd);

    try {
      const exitCode = await routeCommand(['--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(io.stdout)).toStrictEqual({
        schemaVersion: 1,
        error: { code: 'config', message: expect.any(String) },
      });
    } finally {
      process.chdir(temp.dir);
      rmSync(brokenCwd, { recursive: true, force: true });
    }
  });
});

describe('stdout purity under --json', () => {
  it.for([
    { label: 'a passing run', args: ['passing', '--json'] },
    { label: 'a failing run', args: ['failing', '--json'] },
    { label: 'a bad flag', args: ['--bogus', '--json'] },
    { label: 'a missing kit', args: ['absent', '--json'] },
    { label: 'an unknown command', args: ['compil', '--json'] },
    { label: 'a list failure', args: ['list', '--from', 'dir:/definitely/absent', '--json'] },
    { label: 'a verify failure', args: ['verify', '--manifest', 'absent.json', '--json'] },
    { label: 'an init usage error', args: ['init', '--json'] },
  ])('writes exactly one JSON document to stdout for $label', async ({ args }, { io }) => {
    await routeCommand(args);

    const written = io.stdout;
    expect(() => {
      JSON.parse(written);
    }).not.toThrow();
    expect(written.trimEnd()).not.toContain('\n');
  });

  it('keeps stderr empty when an error is reported through the envelope', async ({ io }) => {
    await routeCommand(['--bogus', '--json']);

    expect(io.stderr).toBe('');
  });

  it('reports errors as prose on stderr when --json is absent', async ({ io }) => {
    const exitCode = await routeCommand(['--bogus']);

    expect(exitCode).toBe(2);
    expect(io.stderr).toContain('Error:');
    expect(io.stdout).toBe('');
  });

  it.for([
    { label: 'the retired short flag', flag: '-j' },
    { label: 'a short cluster containing j', flag: '-jJ' },
  ])('takes the prose path for a flag-parse failure spelled with $label', async ({ flag }, { io }) => {
    const exitCode = await routeCommand([flag]);

    expect(exitCode).toBe(2);
    expect(io.stdout).toBe('');
    expect(io.stderr).toContain('Error:');
  });
});

describe('flag surface', () => {
  it.for(['-J', '-F', '-R', '-i', '-u', '-j'])(
    'exits 2 with a usage error for the retired short %s',
    async (short, { io }) => {
      const exitCode = await routeCommand(['--json', short]);

      expect(exitCode).toBe(2);
      expect(JSON.parse(io.stdout)).toMatchObject({ error: { code: 'usage' } });
    },
  );

  it.for([
    { long: '--jit', args: ['--jit'] },
    { long: '--internal', args: ['--internal'] },
    { long: '--url', args: ['--url', 'file://absent'] },
    { long: '--fail-on', args: ['passing', '--fail-on', 'warn'] },
    { long: '--report-on', args: ['passing', '--report-on', 'error'] },
  ])('leaves $long accepted after its short is retired', async ({ args }, { io }) => {
    // The flag may still fail for want of a kit; what matters is that it is not a usage error.
    const exitCode = await routeCommand([...args, '--json']);

    if (exitCode === 2) {
      expect(JSON.parse(io.stdout)).not.toMatchObject({ error: { code: 'usage' } });
    }
  });

  it('runs the named checklists from a single positional kit', async ({ io }) => {
    const exitCode = await routeCommand(['deploy', '--checklists', 'build,test', '--json']);

    expect(exitCode).toBe(0);
    const written = io.stdout;
    expect(written).toContain('build');
    expect(written).toContain('test');
    expect(written).not.toContain('lint');
  });

  it.for([
    { label: 'a ":" filter competing with --checklists', args: ['deploy:build', '--checklists', 'test'] },
    { label: 'more than one positional kit', args: ['deploy', 'passing', '--checklists', 'build'] },
  ])('exits 2 with a usage error for $label', async ({ args }, { io }) => {
    const exitCode = await routeCommand([...args, '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stdout)).toMatchObject({ error: { code: 'usage' } });
  });

  // Asserted without `--json`, which `init` does not accept either; adding it would let this pass
  // on the wrong flag.
  it('exits 2 for the retired init -f short', async ({ io }) => {
    const exitCode = await routeCommand(['init', '-f']);

    expect(exitCode).toBe(2);
    expect(io.stderr).toContain("Unknown option '-f'");
  });
});

describe('subcommand error classification', () => {
  it.for([
    { command: 'run', args: ['run', '--bogus'] },
    { command: 'list', args: ['list', '--bogus'] },
    { command: 'verify', args: ['verify', '--bogus'] },
    { command: 'compile', args: ['compile', '--bogus'] },
    { command: 'init', args: ['init', '--bogus'] },
  ])('exits 2 with a usage error for $command', async ({ args }, { io }) => {
    const exitCode = await routeCommand([...args, '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stdout)).toMatchObject({ error: { code: 'usage' } });
  });
});
