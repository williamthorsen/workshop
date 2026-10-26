import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { itWithPlaceholderBrowser } from '../../chrome/test-utils/placeholder-browser.ts';
import { makeFixtureDir } from '../../test-utils/fixture-dir.ts';
import { ISOLATED_GIT_ENV, makeGitFixture } from '../../test-utils/git-fixture.ts';
import { makeStubPath } from '../../test-utils/stub-path.ts';

/** The TypeScript entry point, whose types node strips. */
const ENTRY = path.resolve(import.meta.dirname, '../thor-chrome.ts');

const BUILD_ENTRY = 'dist/esm/bin/thor-chrome.js';

const WRAPPER_ENTRY = 'bin/thor-chrome.js';

const WRAPPER_SOURCE = fs.readFileSync(path.join(import.meta.dirname, '../../../', WRAPPER_ENTRY), 'utf8');

/** The fields of every profile object, in order, on which the consumers of `--json` rely. */
const PROFILE_FIELDS = [
  'name',
  'path',
  'state',
  'pid',
  'port',
  'devtools',
  'origin',
  'repo',
  'branch',
  'stale',
  'lastUsedAt',
];

/** Tools that report a free port, an answering endpoint, and the GUI login session. */
const TOOL_STUBS = {
  curl: 'exit 0',
  launchctl: 'echo Aqua',
  lsof: 'exit 1',
};

/** A `pgrep` that finds no process, so that the tests that start no placeholder do not depend on the process list. */
const PGREP_STUB = { pgrep: 'exit 1' };

describe('thor-chrome', () => {
  it('prints the usage on stdout with status 0', () => {
    const result = runEntry(['--help'], makeEnvironment());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:\n  thor-chrome [launch] [--profile <name>]');
    expect(result.stderr).toBe('');
  });

  it('refuses a usage error with status 2, naming --help', () => {
    const result = runEntry(['frobnicate'], makeEnvironment());
    expect(result).toMatchObject({
      status: 2,
      stderr: "Error: unknown command 'frobnicate'\nTry 'thor-chrome --help'.\n",
      stdout: '',
    });
  });

  it('refuses a usage error under --json with one document on stdout and status 2', () => {
    const result = runEntry(['list', '--port', '1', '--json'], makeEnvironment());
    expect(result).toMatchObject({
      status: 2,
      stderr: '',
      stdout: '{"error":{"code":"usage","message":"unknown option --port for list"}}\n',
    });
  });

  it('reports status --json with the profile fields and the endpoint', () => {
    const environment = makeEnvironment();
    const result = runEntry(['status', '--json'], environment);
    expect(result.status).toBe(0);
    const report: unknown = JSON.parse(result.stdout);
    expect(Object.keys(readRecord(report))).toStrictEqual(['profile', 'endpoint']);
    expect(Object.keys(readRecord(readRecord(report)['profile']))).toStrictEqual(PROFILE_FIELDS);
    expect(report).toMatchObject({
      endpoint: 'http://127.0.0.1:9960',
      profile: {
        name: 'clone-feature',
        path: `${environment.home}/.local/share/thor-chrome/profiles/clone-feature`,
        state: 'stopped',
      },
    });
  });

  it('reports list --json with the profile fields', () => {
    const environment = makeEnvironment();
    fs.mkdirSync(`${environment.home}/.local/share/thor-chrome/profiles/thrive`, { recursive: true });
    const result = runEntry(['list', '--json'], environment);
    expect(result.status).toBe(0);
    const report: unknown = JSON.parse(result.stdout);
    expect(report).toMatchObject({ profiles: [{ name: 'thrive', state: 'stopped' }] });
    const [profile] = readArray(readRecord(report)['profiles']);
    expect(Object.keys(readRecord(profile))).toStrictEqual(PROFILE_FIELDS);
  });

  it("keeps git's refusal to read a profile's recorded repository out of list --json", () => {
    const environment = makeEnvironment();
    const notRepo = `${environment.home}/work/not-a-repo`;
    const profileDir = `${environment.home}/.local/share/thor-chrome/profiles/widget-9`;
    fs.mkdirSync(notRepo, { recursive: true });
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(
      `${profileDir}/.thor-chrome.record`,
      `origin=derived\nbranch=9\nrepo=widget\nrepo_dir=${notRepo}\n`,
    );
    const result = runEntry(['list', '--json'], environment);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ profiles: [{ name: 'widget-9', stale: false }] });
    expect(result.stderr).toBe('');
  });

  it('refuses outside a repository with the underived-profile code', () => {
    const environment = makeEnvironment();
    const result = runEntry(['status', '--json'], { ...environment, cwd: environment.home });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: 'underived-profile' } });
  });

  /* eslint-disable vitest/require-hook, vitest/no-standalone-expect -- itWithPlaceholderBrowser registers a test, which
     the rules do not recognize as one. */
  itWithPlaceholderBrowser("reports a running browser's PID and port under status --json", async (start) => {
    const environment = makeEnvironment({ isProcessListReal: true });
    const profileDir = `${environment.home}/.local/share/thor-chrome/profiles/thrive`;
    fs.mkdirSync(profileDir, { recursive: true });
    const pid = await start(['--remote-debugging-port=9333', `--user-data-dir=${profileDir}`]);

    const result = runEntry(['status', 'thrive', '--json'], environment);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      endpoint: 'http://127.0.0.1:9333',
      profile: { pid, port: 9_333, state: 'debugging' },
    });
  });

  itWithPlaceholderBrowser("quits a running profile's browser", async (start) => {
    const environment = makeEnvironment({ isProcessListReal: true });
    const profileDir = `${environment.home}/.local/share/thor-chrome/profiles/thrive`;
    fs.mkdirSync(profileDir, { recursive: true });
    const pid = await start([`--user-data-dir=${profileDir}`]);

    const result = runEntry(['quit', 'thrive'], environment);
    expect(result).toMatchObject({ status: 0, stdout: `Quit profile 'thrive' (PID ${pid}).\n` });
  });
  /* eslint-enable vitest/require-hook, vitest/no-standalone-expect */
});

describe('thor-chrome wrapper', () => {
  it('reports the absent build and names the command that produces it', () => {
    using tree = createTempTree({ [WRAPPER_ENTRY]: WRAPPER_SOURCE });

    const { status, stderr } = runWrapper(tree);

    expect(status).toBe(1);
    expect(stderr).toMatch(/build output not found/);
    expect(stderr).toMatch(/nmr build/);
  });

  it('reports a load failure when the build is present and one of its imports is not', () => {
    using tree = createTempTree({
      [WRAPPER_ENTRY]: WRAPPER_SOURCE,
      [BUILD_ENTRY]: "import './absent.js';\n",
    });

    const { status, stderr } = runWrapper(tree);

    expect(status).toBe(1);
    expect(stderr).toMatch(/failed to load/);
    // The absence is the assertion: The gate reads the entry file, whereas the error code that it would otherwise
    // key on fires for any unresolved module in the graph.
    expect(stderr).not.toMatch(/build output not found/);
  });
});

// region | Helpers

/** Where and with what environment the entry runs. */
interface Environment {
  cwd: string;
  env: NodeJS.ProcessEnv;
  home: string;
}

/**
 * Builds a scratch home and a working repository on branch `feature`, with the tools stubbed ahead of PATH; `pgrep` is
 * stubbed too unless the test reads the real process list.
 */
function makeEnvironment(options: { isProcessListReal?: boolean } = {}): Environment {
  const home = makeFixtureDir();
  const { clone } = makeGitFixture();
  const stubs = options.isProcessListReal === true ? TOOL_STUBS : { ...TOOL_STUBS, ...PGREP_STUB };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...ISOLATED_GIT_ENV,
    THOR_CHROME_BROWSER: undefined,
    THOR_CHROME_PROFILE: undefined,
    HOME: home,
    NO_COLOR: '1',
    PATH: makeStubPath(stubs),
    TMPDIR: home,
    XDG_DATA_HOME: undefined,
  };
  return { cwd: clone, env, home };
}

/** Returns a value as an array, failing the test when it is not one. */
function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`expected an array: ${JSON.stringify(value)}`);
  return value;
}

/** Returns a value as a record, failing the test when it is not an object. */
function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`expected an object: ${JSON.stringify(value)}`);
  }
  return { ...value };
}

/** Runs the entry under the test's own Node and returns its status and output. */
function runEntry(args: string[], environment: Environment) {
  return spawnSync(process.execPath, [ENTRY, ...args], {
    cwd: environment.cwd,
    encoding: 'utf8',
    env: environment.env,
  });
}

/** Runs the wrapper written into a tree, returning what the process wrote to stderr and exited with. */
function runWrapper(tree: TempTree): { status: number | null; stderr: string } {
  const { status, stderr } = spawnSync(process.execPath, [tree.resolve(WRAPPER_ENTRY)], { encoding: 'utf8' });

  return { status, stderr };
}

// endregion | Helpers
