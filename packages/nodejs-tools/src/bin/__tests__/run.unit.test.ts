import type { PackageManagerPin, StrandedAsdfShim } from '@williamthorsen/toolbelt.nodejs/candidate';
import { describe, expect, it } from 'vitest';

import type { PnpmProvider } from '../resolvePnpmProvider.ts';
import { type PnpmVersionResult, run, type ThorNodeEffects } from '../run.ts';
import { runWithBuffers } from '../test-utils/runWithBuffers.ts';

const DATA_DIR = '/Users/me/.asdf';
const EXEC_PATH = `${DATA_DIR}/installs/nodejs/24.20.0/bin/node`;
const VERSION = '9.9.9';

const NO_PROVIDER: StrandedAsdfShim = {
  backingPackage: 'pnpm',
  name: 'pn',
  otherProvider: undefined,
  providingVersions: ['24.18.1'],
  shimPath: `${DATA_DIR}/shims/pn`,
};

const ORPHAN: StrandedAsdfShim = {
  backingPackage: 'foo-cli',
  name: 'foo',
  otherProvider: '/opt/homebrew/bin/foo',
  providingVersions: ['22.14.0'],
  shimPath: `${DATA_DIR}/shims/foo`,
};

const PIN: PackageManagerPin = { dir: '/repo', manifestPath: '/repo/package.json', spec: 'pnpm@12.4.0+sha512.abc' };
const PIN_LABEL = 'packageManager pnpm@12.4.0 in /repo/package.json';
const SHIM_PATH = `${DATA_DIR}/shims/pnpm`;

const COREPACK_PROVIDER: PnpmProvider = { kind: 'corepack', nodeVersion: '24.20.0', path: SHIM_PATH };
const PLUGIN_PROVIDER: PnpmProvider = {
  kind: 'asdf-plugin',
  path: SHIM_PATH,
  toolVersions: { filePath: '/repo/.tool-versions', version: '9.0.0' },
  versions: ['9.0.0'],
};

describe(run, () => {
  describe('asdf-shims', () => {
    it('reports a clean install on one line and exits 0', async () => {
      await expect(runAsdfShims([], [])).resolves.toStrictEqual({
        exitCode: 0,
        stderr: '',
        stdout: 'nodejs 24.20.0 (asdf): no stranded shims\n',
      });
    });

    it('reports a shim with no other provider, with the commands that provide and remove it, and exits 1', async () => {
      await expect(runAsdfShims([NO_PROVIDER], [])).resolves.toStrictEqual({
        exitCode: 1,
        stderr: '',
        stdout: [
          'nodejs 24.20.0 (asdf): 1 stranded shim in /Users/me/.asdf/shims',
          '',
          'pn: stranded, no other provider on PATH',
          '  provided by nodejs 24.18.1 (npm package pnpm)',
          '  to provide it under 24.20.0:',
          '    npm install --global pnpm',
          '    asdf reshim nodejs',
          '  to remove it:',
          '    ASDF_NODEJS_VERSION=24.18.1 npm uninstall --global pnpm',
          '    asdf reshim nodejs',
          '',
        ].join('\n'),
      });
    });

    it('reports an orphan with the removal commands alone, one per providing version', async () => {
      const orphan = { ...ORPHAN, providingVersions: ['22.14.0', '20.19.0'] };

      expect((await runAsdfShims([orphan], [])).stdout).toBe(
        [
          'nodejs 24.20.0 (asdf): 1 stranded shim in /Users/me/.asdf/shims',
          '',
          'foo: orphan, shadows /opt/homebrew/bin/foo',
          '  provided by nodejs 22.14.0, 20.19.0 (npm package foo-cli)',
          '  to remove it:',
          '    ASDF_NODEJS_VERSION=22.14.0 npm uninstall --global foo-cli',
          '    ASDF_NODEJS_VERSION=20.19.0 npm uninstall --global foo-cli',
          '    asdf reshim nodejs',
          '',
        ].join('\n'),
      );
    });

    it('uses corepack rather than npm for a shim that corepack backs', async () => {
      const shim = { ...NO_PROVIDER, backingPackage: 'corepack', name: 'yarn' };

      expect((await runAsdfShims([shim], [])).stdout).toContain(
        [
          '  to provide it under 24.20.0:',
          '    corepack enable',
          '    asdf reshim nodejs',
          '  to remove it:',
          '    ASDF_NODEJS_VERSION=24.18.1 corepack disable',
          '    asdf reshim nodejs',
        ].join('\n'),
      );
    });

    it('installs corepack first when the active version lacks it, which a stranded corepack shim shows', async () => {
      const corepack = { ...NO_PROVIDER, backingPackage: 'corepack', name: 'corepack' };
      const yarn = { ...NO_PROVIDER, backingPackage: 'corepack', name: 'yarn' };

      expect((await runAsdfShims([corepack, yarn], [])).stdout).toBe(
        [
          'nodejs 24.20.0 (asdf): 2 stranded shims in /Users/me/.asdf/shims',
          '',
          'corepack: stranded, no other provider on PATH',
          '  provided by nodejs 24.18.1 (npm package corepack)',
          '  to provide it under 24.20.0:',
          '    npm install --global corepack',
          '    asdf reshim nodejs',
          '  to remove it:',
          '    ASDF_NODEJS_VERSION=24.18.1 corepack disable',
          '    asdf reshim nodejs',
          '',
          'yarn: stranded, no other provider on PATH',
          '  provided by nodejs 24.18.1 (npm package corepack)',
          '  to provide it under 24.20.0:',
          '    npm install --global corepack',
          '    asdf reshim nodejs',
          '    corepack enable',
          '    asdf reshim nodejs',
          '  to remove it:',
          '    ASDF_NODEJS_VERSION=24.18.1 corepack disable',
          '    asdf reshim nodejs',
          '',
        ].join('\n'),
      );
    });

    it('removes the executable itself when no package backs the shim, and offers no provide step', async () => {
      const shim = { ...NO_PROVIDER, backingPackage: undefined, name: 'tool' };

      expect((await runAsdfShims([shim], [])).stdout).toBe(
        [
          'nodejs 24.20.0 (asdf): 1 stranded shim in /Users/me/.asdf/shims',
          '',
          'tool: stranded, no other provider on PATH',
          '  provided by nodejs 24.18.1',
          '  to remove it:',
          '    rm /Users/me/.asdf/installs/nodejs/24.18.1/bin/tool',
          '    asdf reshim nodejs',
          '',
        ].join('\n'),
      );
    });

    it('separates several shims with a blank line and pluralizes the count', async () => {
      const { stdout } = await runAsdfShims([ORPHAN, NO_PROVIDER], []);

      expect(stdout).toMatch(/^nodejs 24\.20\.0 \(asdf\): 2 stranded shims in /);
      expect(stdout).toContain('\n\nfoo: orphan');
      expect(stdout).toContain('\n\npn: stranded');
    });

    it('passes the install and PATH through to the detection', async () => {
      let received: unknown;
      const effects = buildEffects([], ['/usr/bin', '/opt/homebrew/bin']);

      await runWithBuffers(['asdf-shims'], {
        ...effects,
        listStrandedShims: (options) => {
          received = options;
          return [];
        },
      });

      expect(received).toStrictEqual({
        dataDir: DATA_DIR,
        pathDirs: ['/usr/bin', '/opt/homebrew/bin'],
        plugin: 'nodejs',
        version: '24.20.0',
      });
    });

    it.each(['/opt/homebrew/bin/node', `${DATA_DIR}/installs/python/3.13.1/bin/node`])(
      'exits 3 with the reason on stderr when node is not an asdf nodejs install: %s',
      async (execPath) => {
        await expect(runWithBuffers(['asdf-shims'], { ...buildEffects([], []), execPath })).resolves.toStrictEqual({
          exitCode: 3,
          stderr: `node at ${execPath} is not an asdf nodejs install; nothing to check.\n`,
          stdout: '',
        });
      },
    );

    it('rejects a positional and an unknown option with exit 2', async () => {
      expect((await runWithBuffers(['asdf-shims', 'extra'], buildEffects([], []))).exitCode).toBe(2);
      await expect(runWithBuffers(['asdf-shims', '--all'], buildEffects([], []))).resolves.toMatchObject({
        exitCode: 2,
        stderr: expect.stringContaining("Try 'thor-node asdf-shims --help'."),
      });
    });
  });

  describe('pnpm', () => {
    it('reports a match with the provider and exits 0', async () => {
      await expect(runPnpm({})).resolves.toStrictEqual({
        exitCode: 0,
        stderr: '',
        stdout: [
          `pnpm 12.4.0 matches ${PIN_LABEL}`,
          '  pnpm on PATH: /Users/me/.asdf/shims/pnpm, corepack under nodejs 24.20.0',
          '',
        ].join('\n'),
      });
    });

    it('reports a mismatch with the repair through corepack and exits 1', async () => {
      await expect(runPnpm({ result: { version: '11.24.0' } })).resolves.toStrictEqual({
        exitCode: 1,
        stderr: '',
        stdout: [
          `pnpm 11.24.0 does not match ${PIN_LABEL}`,
          '  pnpm on PATH: /Users/me/.asdf/shims/pnpm, corepack under nodejs 24.20.0',
          '  to run the pinned version:',
          '    corepack install',
          '',
        ].join('\n'),
      });
    });

    it('repairs the asdf plugin by installing the pin and setting the entry that selects it', async () => {
      expect((await runPnpm({ provider: PLUGIN_PROVIDER, result: { version: '9.0.0' } })).stdout).toBe(
        [
          `pnpm 9.0.0 does not match ${PIN_LABEL}`,
          '  pnpm on PATH: /Users/me/.asdf/shims/pnpm, asdf pnpm plugin (selected by /repo/.tool-versions)',
          '  to run the pinned version:',
          '    asdf install pnpm 12.4.0',
          '    set pnpm 12.4.0 in /repo/.tool-versions',
          '',
        ].join('\n'),
      );
    });

    it('adds the entry to the pinned directory when none selects the plugin', async () => {
      const provider = { ...PLUGIN_PROVIDER, toolVersions: undefined };

      expect((await runPnpm({ provider, result: { version: '9.0.0' } })).stdout).toContain(
        [
          '  pnpm on PATH: /Users/me/.asdf/shims/pnpm, asdf pnpm plugin',
          '  to run the pinned version:',
          '    asdf install pnpm 12.4.0',
          '    add pnpm 12.4.0 to /repo/.tool-versions',
        ].join('\n'),
      );
    });

    it('repairs an npm-global pnpm with a global install, reshimming under an asdf node', async () => {
      const provider: PnpmProvider = { kind: 'npm-global', nodeVersion: '24.20.0', path: SHIM_PATH };

      expect((await runPnpm({ provider, result: { version: '9.0.0' } })).stdout).toContain(
        [
          '  pnpm on PATH: /Users/me/.asdf/shims/pnpm, npm-global pnpm under nodejs 24.20.0',
          '  to run the pinned version:',
          '    npm install --global pnpm@12.4.0',
          '    asdf reshim nodejs',
        ].join('\n'),
      );
    });

    it('omits the nodejs version and the reshim under a node outside asdf', async () => {
      const provider: PnpmProvider = { kind: 'corepack', nodeVersion: undefined, path: '/opt/homebrew/bin/pnpm' };
      const absent: PnpmProvider = { kind: 'absent' };
      const execPath = '/opt/homebrew/bin/node';

      expect((await runPnpm({ execPath, provider, result: { version: '9.0.0' } })).stdout).toContain(
        '  pnpm on PATH: /opt/homebrew/bin/pnpm, corepack\n',
      );
      expect((await runPnpm({ execPath, provider: absent })).stdout).toBe(
        [
          `pnpm is not on PATH; ${PIN_LABEL} cannot run`,
          '  pnpm on PATH: none',
          '  to run the pinned version:',
          '    npm install --global pnpm@12.4.0',
          '',
        ].join('\n'),
      );
    });

    it('reports a stranded shim under the running node, pointing at asdf-shims', async () => {
      const provider: PnpmProvider = { kind: 'stranded-shim', path: SHIM_PATH, providingVersions: ['24.18.1'] };

      expect((await runPnpm({ provider, result: { failure: 'exit 126' } })).stdout).toBe(
        [
          `pnpm reported no version (exit 126); ${PIN_LABEL} did not run`,
          '  pnpm on PATH: /Users/me/.asdf/shims/pnpm, asdf shim stranded under nodejs 24.20.0, provided by nodejs 24.18.1; see thor-node asdf-shims',
          '  to run the pinned version:',
          '    npm install --global pnpm@12.4.0',
          '    asdf reshim nodejs',
          '',
        ].join('\n'),
      );
    });

    it('describes a nodejs shim found under a node outside asdf', async () => {
      const provider: PnpmProvider = { kind: 'stranded-shim', path: SHIM_PATH, providingVersions: ['24.18.1'] };

      expect((await runPnpm({ execPath: '/opt/homebrew/bin/node', provider })).stdout).toContain(
        ', asdf shim provided by nodejs 24.18.1, while node at /opt/homebrew/bin/node is not an asdf install\n',
      );
    });

    it('names a provider known only by path and tells the reader to install the pin there', async () => {
      const provider: PnpmProvider = { kind: 'path', path: '/opt/homebrew/bin/pnpm' };

      expect((await runPnpm({ provider, result: { version: '9.0.0' } })).stdout).toBe(
        [
          `pnpm 9.0.0 does not match ${PIN_LABEL}`,
          '  pnpm on PATH: /opt/homebrew/bin/pnpm',
          '  to run the pinned version:',
          '    install pnpm@12.4.0 where pnpm comes from: /opt/homebrew/bin/pnpm',
          '',
        ].join('\n'),
      );
    });

    it('does not run pnpm when it is absent, and exits 1', async () => {
      let ran = false;
      const effects: ThorNodeEffects = {
        ...buildPnpmEffects({ provider: { kind: 'absent' } }),
        runPnpmVersion: () => {
          ran = true;
          return { version: '12.4.0' };
        },
      };

      expect((await runWithBuffers(['pnpm'], effects)).exitCode).toBe(1);
      expect(ran).toBe(false);
    });

    it('exits 3 with the provider alone when no pin is in reach', async () => {
      await expect(runPnpm({ pin: undefined })).resolves.toStrictEqual({
        exitCode: 3,
        stderr: 'No package.json declaring packageManager at or above /repo/packages/lib; nothing to check.\n',
        stdout: 'pnpm on PATH: /Users/me/.asdf/shims/pnpm, corepack under nodejs 24.20.0\n',
      });
    });

    it.each([
      ['yarn@4.0.0', 'packageManager in /repo/package.json is yarn, not pnpm; nothing to check.'],
      ['pnpm', 'packageManager pnpm in /repo/package.json is not <name>@<version>; nothing to check.'],
    ])('exits 3 when the pin does not name a pnpm version: %s', async (spec, reason) => {
      await expect(runPnpm({ pin: { ...PIN, spec } })).resolves.toMatchObject({ exitCode: 3, stderr: `${reason}\n` });
    });

    it('looks the pin up from the working directory and runs pnpm in the pinned directory', async () => {
      const received: string[] = [];
      const effects: ThorNodeEffects = {
        ...buildPnpmEffects({}),
        findPin: (startDir) => {
          received.push(startDir);
          return PIN;
        },
        runPnpmVersion: (dir) => {
          received.push(dir);
          return { version: '12.4.0' };
        },
      };

      await runWithBuffers(['pnpm'], effects);

      expect(received).toStrictEqual(['/repo/packages/lib', '/repo']);
    });

    it('rejects a positional and an unknown option with exit 2', async () => {
      expect((await runWithBuffers(['pnpm', 'extra'], buildPnpmEffects({}))).exitCode).toBe(2);
      await expect(runWithBuffers(['pnpm', '--all'], buildPnpmEffects({}))).resolves.toMatchObject({
        exitCode: 2,
        stderr: expect.stringContaining("Try 'thor-node pnpm --help'."),
      });
    });
  });

  describe('help and version', () => {
    it.each([['--help'], ['-h']])('prints the root help on %o', async (flag) => {
      const { exitCode, stdout } = await runWithBuffers([flag], buildEffects([], []));

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: thor-node [options] <command>');
      expect(stdout).toContain('Exit codes:');
      expect(stdout).toContain('asdf-shims');
      expect(stdout).toContain('pnpm');
      expect(stdout).toContain('prune-modules');
    });

    it('prints the prune-modules help with its flags, protect-list, and exit codes', async () => {
      const { exitCode, stdout } = await runWithBuffers(['prune-modules', '--help'], buildEffects([], []));

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: thor-node prune-modules');
      for (const flag of [
        '--active-days',
        '--apply',
        '--no-active-guard',
        '--no-confirm',
        '--protect-list',
        '--root',
      ]) {
        expect(stdout).toContain(flag);
      }
      expect(stdout).toContain('~/.config/thor-node/protected-node-modules.txt');
      expect(stdout).toContain('It exits 0 when it completes');
    });

    it.each([['--help'], ['-h']])('prints the pnpm help on %o', async (flag) => {
      const { exitCode, stdout } = await runWithBuffers(['pnpm', flag], buildEffects([], []));

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: thor-node pnpm');
      expect(stdout).toContain('may download');
    });

    it.each([['--help'], ['-h']])('prints the subcommand help on %o', async (flag) => {
      const { exitCode, stdout } = await runWithBuffers(['asdf-shims', flag], buildEffects([], []));

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: thor-node asdf-shims');
      expect(stdout.match(/^Options:$/gm)).toHaveLength(1);
      expect(stdout).toContain('asdf reshim nodejs');
    });

    it.each([['--version'], ['-V']])('prints the version on %o', async (flag) => {
      await expect(runWithBuffers([flag], buildEffects([], []))).resolves.toStrictEqual({
        exitCode: 0,
        stderr: '',
        stdout: `${VERSION}\n`,
      });
    });
  });

  describe('usage errors', () => {
    it('reports a failure to resolve the version as a usage error', async () => {
      const effects: ThorNodeEffects = {
        ...buildEffects([], []),
        resolveVersion: () => {
          throw new Error('The manifest declares no version.');
        },
      };

      await expect(runWithBuffers(['--version'], effects)).resolves.toStrictEqual({
        exitCode: 2,
        stderr: "Error: The manifest declares no version.\nTry 'thor-node --help'.\n",
        stdout: '',
      });
    });

    it('suggests the closest command for a near miss', async () => {
      expect((await runWithBuffers(['pnmp'], buildEffects([], []))).stderr).toContain("Did you mean 'pnpm'?");
    });

    it.each([
      [[], 'Error: A command is required.'],
      [['frobnicate'], 'Error: Unknown command: frobnicate'],
      [['--frobnicate'], 'Error: Unknown option: --frobnicate'],
    ])('exits 2 pointing at the root help: %o', async (args, message) => {
      await expect(runWithBuffers(args, buildEffects([], []))).resolves.toStrictEqual({
        exitCode: 2,
        stderr: `${message}\nTry 'thor-node --help'.\n`,
        stdout: '',
      });
    });
  });
});

// region | Helpers

/** Builds effects under an asdf-managed node 24.20.0 whose detection returns the given shims. */
function buildEffects(shims: StrandedAsdfShim[], pathDirs: string[]): ThorNodeEffects {
  return {
    cwd: '/repo/packages/lib',
    execPath: EXEC_PATH,
    findPin: () => PIN,
    homeDir: '/Users/me',
    isStdinTty: () => false,
    listStrandedShims: () => shims,
    now: () => 0,
    pathDirs,
    readAnswer: () => Promise.resolve(undefined),
    resolvePnpmProvider: () => COREPACK_PROVIDER,
    resolveVersion: () => VERSION,
    runPnpmVersion: () => ({ version: '12.4.0' }),
  };
}

/** Builds effects for `pnpm` that report the pin, the provider, and the run given, defaulting to a corepack match. */
function buildPnpmEffects(options: PnpmScenario): ThorNodeEffects {
  const pin = 'pin' in options ? options.pin : PIN;

  return {
    ...buildEffects([], []),
    execPath: options.execPath ?? EXEC_PATH,
    findPin: () => pin,
    resolvePnpmProvider: () => options.provider ?? COREPACK_PROVIDER,
    runPnpmVersion: () => options.result ?? { version: '12.4.0' },
  };
}

interface PnpmScenario {
  readonly execPath?: string;
  readonly pin?: PackageManagerPin | undefined;
  readonly provider?: PnpmProvider;
  readonly result?: PnpmVersionResult;
}

/** Runs `asdf-shims` under effects whose detection returns the given shims. */
function runAsdfShims(shims: StrandedAsdfShim[], pathDirs: string[]) {
  return runWithBuffers(['asdf-shims'], buildEffects(shims, pathDirs));
}

/** Runs `pnpm` under the scenario's effects. */
function runPnpm(options: PnpmScenario) {
  return runWithBuffers(['pnpm'], buildPnpmEffects(options));
}

// endregion | Helpers
