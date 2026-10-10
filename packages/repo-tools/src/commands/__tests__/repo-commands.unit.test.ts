import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { STACK_DETECTORS } from '../../stacks/stack-detectors.ts';
import { type CloneAdapters, REPO_COMMANDS } from '../repo-commands.ts';
import { type CapturedRun, runCaptured } from '../test-utils/run-captured.ts';

const HOME = '/home/spec';

const REGISTRY = `# Header comment.
repos:
  - name: alpha
    path: ~/repos/alpha
    repo: owner/alpha
    tags: [live]
    stack: [nmr]
  - name: beta
    path: ~/repos/beta
    repo: owner/beta
    tags: [live, vault]
  - name: gamma
    path: ~/repos/gamma
    repo: owner/gamma
    stack: [nextjs, react]
`;

/** Clones whose files signal exactly the stack that `REGISTRY` declares. */
const CURRENT_CLONES = {
  alpha: clone({ 'package.json': { '@williamthorsen/nmr': '1' } }),
  beta: clone({ 'README.md': '' }),
  gamma: clone({ 'apps/web/package.json': { next: '15', react: '19' } }),
};

describe('REPO_COMMANDS', () => {
  describe('help', () => {
    it.each([[[]], [['--help']], [['-h']]])('prints the same help to stdout and returns 0 for %j', async (argv) => {
      const result = await runCaptured(argv);
      expect(result.stdout).toBe((await runCaptured(['--help'])).stdout);
      expect(result.stdout).toContain('Usage: thor-repo');
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });

    it('lists every stack name and states the live guard', async () => {
      const { stdout } = await runCaptured(['--help']);
      expect(stdout).toContain(`Stack names: ${Object.keys(STACK_DETECTORS).join(', ')}`);
      expect(stdout).toContain(
        '--write refuses a registry whose resolved file is in a checkout on a branch named live',
      );
    });

    it('names each verb', () => {
      expect(Object.keys(REPO_COMMANDS.commands)).toStrictEqual(['add', 'list', 'scan']);
    });
  });

  describe('list', () => {
    it('prints every path with ~ expanded', async () => {
      const { result } = await run(['list']);
      expect(result.stdout).toBe(`${HOME}/repos/alpha\n${HOME}/repos/beta\n${HOME}/repos/gamma`);
      expect(result.status).toBe(0);
    });

    it('narrows by tag and by stack, combining the two', async () => {
      expect((await run(['list', '--tag', 'vault'])).result.stdout).toBe(`${HOME}/repos/beta`);
      expect((await run(['list', '--stack', 'react'])).result.stdout).toBe(`${HOME}/repos/gamma`);
      expect((await run(['list', '--stack', 'nmr', '--tag', 'live'])).result.stdout).toBe(`${HOME}/repos/alpha`);
      expect((await run(['list', '--stack', 'react', '--tag', 'live'])).result.stdout).toBe('');
    });

    it('emits the selected entries under a repos key, with paths and stack as written', async () => {
      const { result } = await run(['list', '--tag', 'live', '--json']);
      expect(JSON.parse(result.stdout)).toStrictEqual({
        repos: [
          { name: 'alpha', path: '~/repos/alpha', repo: 'owner/alpha', stack: ['nmr'], tags: ['live'] },
          { name: 'beta', path: '~/repos/beta', repo: 'owner/beta', tags: ['live', 'vault'] },
        ],
      });
    });

    it('rejects a stack name that the detector table does not define', async () => {
      const { result } = await run(['list', '--stack', 'nextj']);
      expect(result.stderr).toContain('nextj');
      expect(result.status).toBe(2);
    });

    it('refuses a selected entry without a path, and passes over one that the selection excludes', async () => {
      const registry = 'repos:\n  - name: pathless\n  - name: tagged\n    path: ~/repos/tagged\n    tags: [live]\n';
      const { result } = await run(['list'], { registry });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('thor-repo: registry entry has no path');
      expect((await run(['list', '--tag', 'live'], { registry })).result.stdout).toBe(`${HOME}/repos/tagged`);
    });

    it('names a registry that it cannot find, defaulting to the one under HOME', async () => {
      const result = await runCaptured(['list'], { adapters: fakeAdapters({}), env: { HOME } });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(`thor-repo: registry not found: ${HOME}/.config/repos.yaml`);
    });
  });

  describe('scan', () => {
    it('prints nothing and exits 0 when every stack is current', async () => {
      const { result } = await run(['scan'], { clones: CURRENT_CLONES });
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });

    it('reports additions before removals, each sorted, one line per changed entry', async () => {
      const clones = { ...CURRENT_CLONES, gamma: clone({ 'package.json': { vue: '3', express: '5' } }) };
      const { result } = await run(['scan'], { clones });
      expect(result.stdout).toBe('gamma: +express +vue -nextjs -react');
      expect(result.status).toBe(0);
    });

    it('writes nothing without --write', async () => {
      const clones = { ...CURRENT_CLONES, beta: clone({ 'vercel.json': '' }) };
      const { registryText, result } = await run(['scan'], { clones });
      expect(result.stdout).toBe('beta: +vercel');
      expect(registryText).toBe(REGISTRY);
    });

    it('rewrites each changed stack under --write, removing a stack that is now empty', async () => {
      const clones = { alpha: clone({}), beta: clone({ 'vercel.json': '' }), gamma: CURRENT_CLONES.gamma };
      const { registryText, result } = await run(['scan', '--write'], { clones });
      expect(result.status).toBe(0);
      expect(registryText).toBe(
        REGISTRY.replace('    stack: [nmr]\n', '').replace(
          '    tags: [live, vault]\n',
          '    tags: [live, vault]\n    stack: [vercel]\n',
        ),
      );
    });

    it('reports an absent clone on stderr and keeps its stack', async () => {
      const clones = { beta: CURRENT_CLONES.beta, gamma: clone({}) };
      const { registryText, result } = await run(['scan', '--write'], { clones });
      expect(result.stderr).toBe(`thor-repo: alpha: no clone at ${HOME}/repos/alpha; its stack is kept`);
      expect(result.stdout).toBe('gamma: -nextjs -react');
      expect(registryText).toContain('stack: [nmr]');
    });

    it('reports an unreadable manifest and scans on', async () => {
      const clones = { ...CURRENT_CLONES, beta: { files: { 'package.json': '{' }, tracked: ['package.json'] } };
      const { result } = await run(['scan'], { clones });
      expect(result.stderr).toMatch(/^thor-repo: beta: cannot read package\.json: /);
      expect(result.status).toBe(0);
    });

    it('reports a stack name that the detector table does not define as a removal', async () => {
      const registry = REGISTRY.replace('stack: [nmr]', 'stack: [nmr, rails]');
      const { result } = await run(['scan'], { clones: CURRENT_CLONES, registry });
      expect(result.stdout).toBe('alpha: -rails');
      expect(result.status).toBe(0);
    });

    it('refuses --write to a registry in a checkout on the live branch, naming --file', async () => {
      const { registryText, result } = await run(['scan', '--write'], { branch: 'live', clones: {} });
      expect(result.stderr).toContain('--file <branch worktree copy>');
      expect(result.status).toBe(1);
      expect(registryText).toBe(REGISTRY);
    });
  });

  describe('add', () => {
    it('prints the entry for a clone that the registry lacks, without writing it', async () => {
      const clones = { delta: clone({ 'package.json': { vue: '3' } }) };
      const { registryText, result } = await run(['add', '~/repos/delta'], {
        clones,
        origins: { delta: 'git@github.com:owner/delta.git' },
      });
      expect(result.stdout).toBe('  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n    stack: [vue]');
      expect(result.stderr).toContain('thor-repo: nothing written; pass --write');
      expect(registryText).toBe(REGISTRY);
      expect(result.status).toBe(0);
    });

    it('appends the entry under --write, reading an HTTPS origin', async () => {
      const clones = { delta: clone({}) };
      const origins = { delta: 'https://github.com/owner/delta' };
      const { registryText, result } = await run(['add', `${HOME}/repos/delta`, '--write'], { clones, origins });
      expect(result.status).toBe(0);
      expect(registryText).toBe(`${REGISTRY}  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n`);
    });

    it.each([
      [
        'a registered clone',
        ['add', '~/repos/alpha'],
        { alpha: 'git@github.com:owner/alpha.git' },
        'already registered as alpha',
      ],
      ['a path outside any clone', ['add', '~/elsewhere'], {}, 'is not in a git clone'],
      ['a clone without an origin remote', ['add', '~/repos/delta'], {}, 'has no origin remote'],
    ])('refuses %s', async (_, args, origins, message) => {
      const clones = { alpha: CURRENT_CLONES.alpha, delta: clone({}) };
      const { result } = await run(args, { clones, origins });
      expect(result.stderr).toContain(message);
      expect(result.status).toBe(1);
    });
  });

  describe('arguments', () => {
    it.each([
      [['frob']],
      [['list', '--bogus']],
      [['list', '--tag']],
      [['list', '--file', '']],
      [['list', 'extra']],
      [['scan', '--json']],
      [['scan', 'extra']],
      [['list', '--write']],
      [['add']],
      [['add', 'one', 'two']],
    ])('rejects %j as a usage error', async (argv) => {
      const result = await runCaptured(argv);
      expect(result.stderr).toMatch(/^Error: /);
      expect(result.stdout).toBe('');
      expect(result.status).toBe(2);
    });
  });
});

// region | Helpers

/** A fake clone: the paths that git tracks in it, and the content of its files. */
interface FakeClone {
  files: Record<string, string>;
  tracked: string[];
}

/** Builds a clone from its files, writing an object as a manifest that declares those dependencies. */
function clone(files: Record<string, string | Record<string, string>>): FakeClone {
  const contents = Object.fromEntries(
    Object.entries(files).map(([file, content]) => [
      file,
      typeof content === 'string' ? content : JSON.stringify({ dependencies: content }),
    ]),
  );
  return { files: contents, tracked: Object.keys(contents) };
}

/** Returns adapters over clones at `~/repos/<name>`, with the given origins and the registry's branch. */
function fakeAdapters(
  clones: Record<string, FakeClone>,
  origins: Record<string, string> = {},
  branch = 'main',
): CloneAdapters {
  const cloneName = (dir: string): string | undefined => /^\/home\/spec\/repos\/([^/]+)/.exec(dir)?.[1];
  return {
    listTrackedFiles: (dir) => clones[cloneName(dir) ?? '']?.tracked,
    readCurrentBranch: () => branch,
    readFile: (file) => {
      const name = cloneName(file) ?? '';
      const content = clones[name]?.files[file.slice(`${HOME}/repos/${name}/`.length)];
      if (content === undefined) throw new Error(`absent: ${file}`);
      return content;
    },
    readOriginUrl: (dir) => origins[cloneName(dir) ?? ''],
    readCloneRoot: (dir) => {
      const name = cloneName(dir);
      return name !== undefined && clones[name] !== undefined ? `${HOME}/repos/${name}` : undefined;
    },
  };
}

/**
 * Runs a verb against a fixture registry, returning the captured run and the registry's text afterward. The registry
 * is passed as `--file` after the verb, so that an option missing its value stays the last argument.
 */
async function run(
  args: string[],
  setup: {
    branch?: string;
    clones?: Record<string, FakeClone>;
    origins?: Record<string, string>;
    registry?: string;
  } = {},
): Promise<{ registryText: string; result: CapturedRun }> {
  using tree = createTempTree({ 'repos.yaml': setup.registry ?? REGISTRY }, { prefix: 'repo-tools-' });
  const file = tree.resolve('repos.yaml');
  const adapters = fakeAdapters(setup.clones ?? CURRENT_CLONES, setup.origins, setup.branch);
  const result = await runCaptured([...args.slice(0, 1), '--file', file, ...args.slice(1)], {
    adapters,
    env: { HOME },
  });
  return { registryText: fs.readFileSync(file, 'utf8'), result };
}

// endregion | Helpers
