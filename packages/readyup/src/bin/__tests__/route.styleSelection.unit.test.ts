import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test, vi } from 'vitest';

import { plainFormatter } from '../../layout/plainFormatter.ts';
import { STYLE_ENV_VAR } from '../../layout/resolveStyle.ts';
import { richFormatter } from '../../layout/richFormatter.ts';
import { hashBytes } from '../../verify/targetHash.ts';
import { routeCommand } from '../route.ts';

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

const it = test.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() => {
    const tree = createTempTree(
      { '.readyup/kits/passing.js': PASSING_KIT, 'passing.js': COMPILED_BYTES, 'src/passing.ts': PASSING_KIT },
      { prefix: 'readyup-style-' },
    );
    tree.writeJson('manifest.json', {
      version: 1,
      kits: [{ name: 'passing', path: 'passing.js', source: 'src/passing.ts', targetHash: hashBytes(COMPILED_BYTES) }],
    });

    return tree;
  }),
);

it.aroundAll(async (runSuite, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runSuite();
});

describe('--style plain', () => {
  it.for(RENDERING_COMMANDS)('renders $name without leaving the ASCII range', async ({ args }) => {
    const { stdout, stderr } = await route([...args, '--style', 'plain']);

    const rendered = stdout + stderr;
    expect(rendered).not.toBe('');
    expect(rendered).toMatch(/^[\u{20}-\u{7E}\n]*$/u);
  });

  it.for(RENDERING_COMMANDS)('renders $name through the plain vocabulary', async ({ args, expected }) => {
    const { stdout, stderr } = await route([...args, '--style', 'plain']);

    expect(stdout + stderr).toMatch(expected);
  });

  it('is accepted as an assigned value too', async () => {
    const { stdout } = await route(['verify', '--manifest', 'manifest.json', '--style=plain']);

    expect(stdout).toContain(`${PLAIN_PASS}  passing`);
  });
});

describe('a style named ahead of the command', () => {
  it.for(RENDERING_COMMANDS)('reaches $name without being taken for a kit name', async ({ args }) => {
    const { exitCode, stderr } = await route(['--style', 'plain', ...args]);

    expect(stderr).not.toContain('not found');
    expect(exitCode).not.toBe(2);
  });

  it('is accepted as an assigned value too', async () => {
    const { exitCode, stdout } = await route(['--style=plain', 'verify', '--manifest', 'manifest.json']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${PLAIN_PASS}  passing`);
  });

  it('leaves --help showing the top-level help rather than the run subcommand\u{2019}s', async () => {
    const { stdout } = await route(['--style', 'plain', '--help']);

    expect(stdout).toContain('rdy <command> [options]');
  });

  it('leaves --version reporting the version', async () => {
    const { stdout } = await route(['--style', 'plain', '--version']);

    expect(stdout).toMatch(/^\d+\.\d+\.\d+/u);
  });

  it('still rejects a trailing --style with no value', async () => {
    const { exitCode } = await route(['--style']);

    expect(exitCode).toBe(2);
  });
});

describe('--style rich', () => {
  it('renders glyphs even when the environment would detect otherwise', async () => {
    vi.stubEnv('CI', 'true');

    const { stdout } = await route(['verify', '--manifest', 'manifest.json', '--style', 'rich'], { isTty: false });

    expect(stdout).toContain(`${RICH_PASS} passing`);
  });
});

describe('an unrecognized style', () => {
  it('fails the invocation and names the valid set', async () => {
    const { exitCode, stderr } = await route(['verify', '--style', 'emoji']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('--style must be one of: auto, plain, rich (got "emoji")');
  });

  it('is rejected from the environment variable as well', async () => {
    vi.stubEnv(STYLE_ENV_VAR, 'text');

    const { exitCode, stderr } = await route(['verify', '--manifest', 'manifest.json']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain(`${STYLE_ENV_VAR} must be one of: auto, plain, rich (got "text")`);
  });
});

describe('detection', () => {
  // The suite pins RDY_STYLE so rendering never depends on the environment it runs in. These tests
  // deliberately unpin it: they are the only coverage of the wiring that reads CI and the terminal.
  it('chooses plain under CI', async () => {
    vi.stubEnv(STYLE_ENV_VAR, undefined);
    vi.stubEnv('CI', 'true');

    const { stdout } = await route(['verify', '--manifest', 'manifest.json'], { isTty: true });

    expect(stdout).toContain(`${PLAIN_PASS}  passing`);
  });

  it('chooses plain when the output is not a terminal', async () => {
    vi.stubEnv(STYLE_ENV_VAR, undefined);
    vi.stubEnv('CI', undefined);

    const { stdout } = await route(['verify', '--manifest', 'manifest.json'], { isTty: false });

    expect(stdout).toContain(`${PLAIN_PASS}  passing`);
  });

  it('chooses rich for a terminal outside CI', async () => {
    vi.stubEnv(STYLE_ENV_VAR, undefined);
    vi.stubEnv('CI', undefined);

    const { stdout } = await route(['verify', '--manifest', 'manifest.json'], { isTty: true });

    expect(stdout).toContain(`${RICH_PASS} passing`);
  });

  it('is outranked by the environment variable', async () => {
    vi.stubEnv(STYLE_ENV_VAR, 'rich');
    vi.stubEnv('CI', 'true');

    const { stdout } = await route(['verify', '--manifest', 'manifest.json']);

    expect(stdout).toContain(`${RICH_PASS} passing`);
  });
});

describe('an explicitly chosen style', () => {
  it.for(['plain', 'rich'] as const)('renders %s identically with and without a terminal', async (style) => {
    const args = ['verify', '--manifest', 'manifest.json', '--style', style];

    const attached = await route(args, { isTty: true });
    const piped = await route(args, { isTty: false });

    expect(piped.stdout).toBe(attached.stdout);
  });
});

describe('alongside --json', () => {
  it('leaves the JSON document on stdout and styles the prose on stderr', async () => {
    const { stdout, stderr } = await route(['verify', '--manifest', 'manifest.json', '--json', '--style', 'plain']);

    const document: unknown = JSON.parse(stdout);
    expect(document).toMatchObject({ passed: true });
    expect(stderr).toContain(PLAIN_PASS);
    expect(stderr).not.toContain(RICH_PASS);
  });

  it('emits the same JSON whichever style is selected', async () => {
    const plain = await route(['verify', '--manifest', 'manifest.json', '--json', '--style', 'plain']);
    const rich = await route(['verify', '--manifest', 'manifest.json', '--json', '--style', 'rich']);

    expect(rich.stdout).toBe(plain.stdout);
  });
});

// region | Helpers

/**
 * Routes a command with the terminal attached or not, returning its exit code and everything it wrote.
 *
 * `init` reports through the console rather than the streams directly, so both channels are captured.
 */
async function route(args: string[], options: { isTty?: boolean } = {}) {
  using io = captureStdio({ includeConsole: true, isTty: options.isTty ?? false });

  const exitCode = await routeCommand(args);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

// endregion | Helpers
