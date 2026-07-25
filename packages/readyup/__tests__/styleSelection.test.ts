import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { routeCommand } from '../src/bin/route.ts';
import { plainFormatter } from '../src/layout/plainFormatter.ts';
import { STYLE_ENV_VAR } from '../src/layout/resolveStyle.ts';
import { richFormatter } from '../src/layout/richFormatter.ts';
import { hashBytes } from '../src/verify/targetHash.ts';

/** A kit whose single check passes. */
const PASSING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;

const COMPILED_BYTES = Buffer.from(PASSING_KIT);

const PLAIN_PASS = plainFormatter.tokens.passed.glyph;
const RICH_PASS = richFormatter.tokens.passed.glyph;

/**
 * Every command that renders output, with arguments that make it produce some against the fixture.
 *
 * `expected` matches a line the command emits in plain style. `list` matches a bare column, since every
 * row it renders leads with a noun token, whose plain rendering is the reserved space alone. `compile`
 * accepts either status: the first invocation against the fixture builds the bundle and the rest find it
 * unchanged, and both outcomes render through the vocabulary under test.
 */
const RENDERING_COMMANDS = [
  { name: 'run', args: ['run', 'passing'], expected: /^PASS {2}ok$/mu },
  { name: 'list', args: ['list', '--manifest', 'manifest.json'], expected: /^ {6}passing$/mu },
  { name: 'verify', args: ['verify', '--manifest', 'manifest.json'], expected: /^PASS {2}passing$/mu },
  { name: 'compile', args: ['compile', '--skip-manifest', 'src/passing.ts'], expected: /^(?:PASS|SKIP) {2}src/mu },
  { name: 'init', args: ['init', '--dry-run'], expected: /^PASS {2}\.config\/readyup\.config\.ts/mu },
] as const;

let cwd: string;
let originalCwd: string;
let originalIsTty: boolean;
let stdout: string[];
let stderr: string[];

beforeAll(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(path.join(tmpdir(), 'readyup-style-'));
  mkdirSync(path.join(cwd, '.readyup/kits'), { recursive: true });
  mkdirSync(path.join(cwd, 'src'), { recursive: true });
  writeFileSync(path.join(cwd, '.readyup/kits/passing.js'), PASSING_KIT);
  writeFileSync(path.join(cwd, 'src/passing.ts'), PASSING_KIT);
  writeFileSync(path.join(cwd, 'passing.js'), COMPILED_BYTES);
  writeFileSync(
    path.join(cwd, 'manifest.json'),
    JSON.stringify({
      version: 1,
      kits: [{ name: 'passing', path: 'passing.js', source: 'src/passing.ts', targetHash: hashBytes(COMPILED_BYTES) }],
    }),
  );
  process.chdir(cwd);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

beforeEach(() => {
  stdout = [];
  stderr = [];
  originalIsTty = process.stdout.isTTY;
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  // `init` reports through the console rather than the streams directly, so both channels are captured.
  vi.spyOn(console, 'info').mockImplementation((chunk: unknown) => {
    stdout.push(`${String(chunk)}\n`);
  });
  vi.spyOn(console, 'error').mockImplementation((chunk: unknown) => {
    stderr.push(`${String(chunk)}\n`);
  });
});

afterEach(() => {
  process.stdout.isTTY = originalIsTty;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('--style plain', () => {
  it.each(RENDERING_COMMANDS)('renders $name without leaving the ASCII range', async ({ args }) => {
    await routeCommand([...args, '--style', 'plain']);

    const rendered = [...stdout, ...stderr].join('');
    expect(rendered).not.toBe('');
    expect(rendered).toMatch(/^[\u{20}-\u{7E}\n]*$/u);
  });

  it.each(RENDERING_COMMANDS)('renders $name through the plain vocabulary', async ({ args, expected }) => {
    await routeCommand([...args, '--style', 'plain']);

    expect([...stdout, ...stderr].join('')).toMatch(expected);
  });

  it('is accepted as an assigned value too', async () => {
    await routeCommand(['verify', '--manifest', 'manifest.json', '--style=plain']);

    expect(stdout.join('')).toContain(`${PLAIN_PASS}  passing`);
  });
});

describe('a style named ahead of the command', () => {
  it.each(RENDERING_COMMANDS)('reaches $name without being taken for a kit name', async ({ args }) => {
    const exitCode = await routeCommand(['--style', 'plain', ...args]);

    expect(stderr.join('')).not.toContain('not found');
    expect(exitCode).not.toBe(2);
  });

  it('is accepted as an assigned value too', async () => {
    const exitCode = await routeCommand(['--style=plain', 'verify', '--manifest', 'manifest.json']);

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain(`${PLAIN_PASS}  passing`);
  });

  it('leaves --help showing the top-level help rather than the run subcommand\u{2019}s', async () => {
    await routeCommand(['--style', 'plain', '--help']);

    expect(stdout.join('')).toContain('rdy <command> [options]');
  });

  it('leaves --version reporting the version', async () => {
    await routeCommand(['--style', 'plain', '--version']);

    expect(stdout.join('')).toMatch(/^\d+\.\d+\.\d+/u);
  });

  it('still rejects a trailing --style that carries no value', async () => {
    const exitCode = await routeCommand(['--style']);

    expect(exitCode).toBe(2);
  });
});

describe('--style rich', () => {
  it('renders glyphs even when the environment would detect otherwise', async () => {
    vi.stubEnv('CI', 'true');
    process.stdout.isTTY = false;

    await routeCommand(['verify', '--manifest', 'manifest.json', '--style', 'rich']);

    expect(stdout.join('')).toContain(`${RICH_PASS} passing`);
  });
});

describe('an unrecognized style', () => {
  it('fails the invocation and names the valid set', async () => {
    const exitCode = await routeCommand(['verify', '--style', 'emoji']);

    expect(exitCode).toBe(2);
    expect(stderr.join('')).toContain('--style must be one of: auto, plain, rich (got "emoji")');
  });

  it('is rejected from the environment variable as well', async () => {
    vi.stubEnv(STYLE_ENV_VAR, 'text');

    const exitCode = await routeCommand(['verify', '--manifest', 'manifest.json']);

    expect(exitCode).toBe(2);
    expect(stderr.join('')).toContain(`${STYLE_ENV_VAR} must be one of: auto, plain, rich (got "text")`);
  });
});

describe('detection', () => {
  // The suite pins RDY_STYLE so rendering never depends on the environment it runs in. These tests
  // deliberately unpin it: they are the only coverage of the wiring that reads CI and the terminal.
  it('chooses plain under CI', async () => {
    vi.stubEnv(STYLE_ENV_VAR, undefined);
    vi.stubEnv('CI', 'true');
    process.stdout.isTTY = true;

    await routeCommand(['verify', '--manifest', 'manifest.json']);

    expect(stdout.join('')).toContain(`${PLAIN_PASS}  passing`);
  });

  it('chooses plain when the output is not a terminal', async () => {
    vi.stubEnv(STYLE_ENV_VAR, undefined);
    vi.stubEnv('CI', undefined);
    process.stdout.isTTY = false;

    await routeCommand(['verify', '--manifest', 'manifest.json']);

    expect(stdout.join('')).toContain(`${PLAIN_PASS}  passing`);
  });

  it('chooses rich for a terminal outside CI', async () => {
    vi.stubEnv(STYLE_ENV_VAR, undefined);
    vi.stubEnv('CI', undefined);
    process.stdout.isTTY = true;

    await routeCommand(['verify', '--manifest', 'manifest.json']);

    expect(stdout.join('')).toContain(`${RICH_PASS} passing`);
  });

  it('is outranked by the environment variable', async () => {
    vi.stubEnv(STYLE_ENV_VAR, 'rich');
    vi.stubEnv('CI', 'true');

    await routeCommand(['verify', '--manifest', 'manifest.json']);

    expect(stdout.join('')).toContain(`${RICH_PASS} passing`);
  });
});

describe('an explicitly chosen style', () => {
  it.each(['plain', 'rich'] as const)('renders %s identically with and without a terminal', async (style) => {
    process.stdout.isTTY = true;
    await routeCommand(['verify', '--manifest', 'manifest.json', '--style', style]);
    const attached = stdout.join('');

    stdout = [];
    process.stdout.isTTY = false;
    await routeCommand(['verify', '--manifest', 'manifest.json', '--style', style]);

    expect(stdout.join('')).toBe(attached);
  });
});

describe('alongside --json', () => {
  it('leaves the JSON document on stdout and styles the prose on stderr', async () => {
    await routeCommand(['verify', '--manifest', 'manifest.json', '--json', '--style', 'plain']);

    const document: unknown = JSON.parse(stdout.join(''));
    expect(document).toMatchObject({ passed: true });
    expect(stderr.join('')).toContain(PLAIN_PASS);
    expect(stderr.join('')).not.toContain(RICH_PASS);
  });

  it('emits the same JSON whichever style is selected', async () => {
    await routeCommand(['verify', '--manifest', 'manifest.json', '--json', '--style', 'plain']);
    const plain = stdout.join('');

    stdout = [];
    await routeCommand(['verify', '--manifest', 'manifest.json', '--json', '--style', 'rich']);

    expect(stdout.join('')).toBe(plain);
  });
});
