import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { GitHubFacts, GitHubReader } from '../../github/github-repo.ts';
import { STACK_DETECTORS } from '../../stacks/stack-detectors.ts';
import { REPO_COMMANDS } from '../repo-commands.ts';
import { buildClone, buildFakeAdapters, FAKE_HOME, type FakeClone } from '../test-utils/fake-clones.ts';
import { type CapturedRun, runCaptured } from '../test-utils/run-captured.ts';

const REGISTRY = `# Header comment.
repos:
  - name: alpha
    path: ~/repos/alpha
    repo: owner/alpha
    visibility: private
    runner: imac2
    tags: [live]
    stack: [nmr]
  - name: beta
    path: ~/repos/beta
    repo: owner/beta
    visibility: private
    tags: [live, vault]
  - name: gamma
    path: ~/repos/gamma
    repo: owner/gamma
    visibility: public
    stack: [nextjs, react]
`;

/** Clones whose files signal exactly the stack that `REGISTRY` declares. */
const CURRENT_CLONES = {
  alpha: buildClone({ 'package.json': { '@williamthorsen/nmr': '1' } }),
  beta: buildClone({ 'README.md': '' }),
  gamma: buildClone({ 'apps/web/package.json': { next: '15', react: '19' } }),
};

/** GitHub facts that equal what `REGISTRY` records, keyed by repo. */
const CURRENT_GITHUB: Record<string, GitHubFacts> = {
  'owner/alpha': facts('private', 'imac2'),
  'owner/beta': facts('private'),
  'owner/gamma': facts('public'),
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
        '--write and move refuse a registry whose resolved file is in a checkout on a branch named live',
      );
    });

    it('names each verb', () => {
      expect(Object.keys(REPO_COMMANDS.commands)).toStrictEqual(['add', 'apply-moves', 'list', 'move', 'scan']);
    });
  });

  describe('list', () => {
    it('prints every path with ~ expanded', async () => {
      const { result } = await run(['list']);
      expect(result.stdout).toBe(`${FAKE_HOME}/repos/alpha\n${FAKE_HOME}/repos/beta\n${FAKE_HOME}/repos/gamma`);
      expect(result.status).toBe(0);
    });

    it('narrows by tag and by stack, combining the two', async () => {
      expect((await run(['list', '--tag', 'vault'])).result.stdout).toBe(`${FAKE_HOME}/repos/beta`);
      expect((await run(['list', '--stack', 'react'])).result.stdout).toBe(`${FAKE_HOME}/repos/gamma`);
      expect((await run(['list', '--stack', 'nmr', '--tag', 'live'])).result.stdout).toBe(`${FAKE_HOME}/repos/alpha`);
      expect((await run(['list', '--stack', 'react', '--tag', 'live'])).result.stdout).toBe('');
    });

    it('emits the selected entries under a repos key, with paths and stack as written', async () => {
      const { result } = await run(['list', '--tag', 'live', '--json']);
      expect(JSON.parse(result.stdout)).toStrictEqual({
        repos: [
          {
            name: 'alpha',
            path: '~/repos/alpha',
            repo: 'owner/alpha',
            runner: 'imac2',
            stack: ['nmr'],
            tags: ['live'],
            visibility: 'private',
          },
          { name: 'beta', path: '~/repos/beta', repo: 'owner/beta', tags: ['live', 'vault'], visibility: 'private' },
        ],
      });
    });

    it('narrows by visibility and by runner', async () => {
      expect((await run(['list', '--visibility', 'public'])).result.stdout).toBe(`${FAKE_HOME}/repos/gamma`);
      expect((await run(['list', '--runner', 'imac2'])).result.stdout).toBe(`${FAKE_HOME}/repos/alpha`);
      expect((await run(['list', '--visibility', 'public', '--runner', 'imac2'])).result.stdout).toBe('');
    });

    it('rejects a visibility outside public and private', async () => {
      const { result } = await run(['list', '--visibility', 'internal']);
      expect(result.stderr).toContain('internal');
      expect(result.status).toBe(2);
    });

    it('lists only the entries whose clone is present by default, and the others under --clone', async () => {
      const clones = { alpha: CURRENT_CLONES.alpha, gamma: CURRENT_CLONES.gamma };
      expect((await run(['list'], { clones })).result.stdout).toBe(
        `${FAKE_HOME}/repos/alpha\n${FAKE_HOME}/repos/gamma`,
      );
      expect((await run(['list', '--clone', 'absent'], { clones })).result.stdout).toBe(`${FAKE_HOME}/repos/beta`);
      expect((await run(['list', '--clone', 'all'], { clones })).result.stdout).toBe(
        `${FAKE_HOME}/repos/alpha\n${FAKE_HOME}/repos/beta\n${FAKE_HOME}/repos/gamma`,
      );
      const { result } = await run(['list', '--clone', 'absent', '--json'], { clones });
      expect(JSON.parse(result.stdout)).toMatchObject({ repos: [{ name: 'beta' }] });
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
      expect((await run(['list', '--tag', 'live', '--clone', 'all'], { registry })).result.stdout).toBe(
        `${FAKE_HOME}/repos/tagged`,
      );
    });

    it('names a registry that it cannot find, defaulting to the one under FAKE_HOME', async () => {
      const result = await runCaptured(['list'], { adapters: buildFakeAdapters({}), env: { HOME: FAKE_HOME } });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(`thor-repo: registry not found: ${FAKE_HOME}/.config/repos.yaml`);
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
      const clones = { ...CURRENT_CLONES, gamma: buildClone({ 'package.json': { vue: '3', express: '5' } }) };
      const { result } = await run(['scan'], { clones });
      expect(result.stdout).toBe('gamma: +express +vue -nextjs -react');
      expect(result.status).toBe(0);
    });

    it('writes nothing without --write', async () => {
      const clones = { ...CURRENT_CLONES, beta: buildClone({ 'vercel.json': '' }) };
      const { registryText, result } = await run(['scan'], { clones });
      expect(result.stdout).toBe('beta: +vercel');
      expect(registryText).toBe(REGISTRY);
    });

    it('rewrites each changed stack under --write, removing a stack that is now empty', async () => {
      const clones = { alpha: buildClone({}), beta: buildClone({ 'vercel.json': '' }), gamma: CURRENT_CLONES.gamma };
      const { registryText, result } = await run(['scan', '--write'], { clones });
      expect(result.status).toBe(0);
      expect(registryText).toBe(
        REGISTRY.replace('    stack: [nmr]\n', '').replace(
          '    tags: [live, vault]\n',
          '    tags: [live, vault]\n    stack: [vercel]\n',
        ),
      );
    });

    it('names every entry whose clone is absent on one stderr line, keeping their stacks', async () => {
      const clones = { gamma: buildClone({}) };
      const { registryText, result } = await run(['scan', '--write'], { clones });
      expect(result.stderr).toBe('thor-repo: no clone on this machine, so the stack is kept, for: alpha, beta');
      expect(result.stdout).toBe('gamma: -nextjs -react');
      expect(registryText).toContain('stack: [nmr]');
    });

    it('reports why a present clone cannot be listed on its own line, keeping its stack', async () => {
      const clones = {
        ...CURRENT_CLONES,
        alpha: { files: {}, tracked: 'cannot run git ls-files: spawnSync git ENOBUFS' },
      };
      const { registryText, result } = await run(['scan', '--write'], { clones });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe(
        'thor-repo: alpha: cannot list the tracked files: cannot run git ls-files: spawnSync git ENOBUFS; the stack is kept',
      );
      expect(registryText).toBe(REGISTRY);
    });

    it('reports and rewrites visibility and runner values that differ from GitHub', async () => {
      const github = { ...CURRENT_GITHUB, 'owner/alpha': facts('private'), 'owner/beta': facts('public', 'm1') };
      const clones = { ...CURRENT_CLONES, beta: buildClone({ 'vercel.json': '' }) };
      const { registryText, result } = await run(['scan', '--write'], { clones, github });
      expect(result.stdout).toBe('alpha: -runner\nbeta: +vercel visibility=public runner=m1');
      expect(registryText).toBe(
        REGISTRY.replace('    runner: imac2\n', '').replace(
          '    visibility: private\n    tags: [live, vault]\n',
          '    visibility: public\n    runner: m1\n    tags: [live, vault]\n    stack: [vercel]\n',
        ),
      );
    });

    it('reads GitHub for an entry whose clone is absent', async () => {
      const github = { ...CURRENT_GITHUB, 'owner/beta': facts('public') };
      const { result } = await run(['scan'], {
        clones: { alpha: CURRENT_CLONES.alpha, gamma: CURRENT_CLONES.gamma },
        github,
      });
      expect(result.stdout).toBe('beta: visibility=public');
    });

    it('keeps the recorded values of an entry whose GitHub read fails, and scans on', async () => {
      const github = { 'owner/beta': facts('public'), 'owner/gamma': facts('public') };
      const { registryText, result } = await run(['scan', '--write'], { github });
      expect(result.stderr).toBe(
        'thor-repo: alpha: cannot read GitHub: no such repo; its visibility and runner are kept',
      );
      expect(result.stdout).toBe('beta: visibility=public');
      expect(registryText).toContain('    visibility: private\n    runner: imac2\n');
      expect(result.status).toBe(0);
    });

    it('keeps the recorded runner when CI_RUNS_ON is unsupported, and still updates visibility', async () => {
      const github = {
        ...CURRENT_GITHUB,
        'owner/alpha': {
          runner: undefined,
          runnerProblem: 'selects more than one label: []',
          visibility: 'public' as const,
        },
      };
      const { result } = await run(['scan'], { github });
      expect(result.stderr).toContain(
        'thor-repo: alpha: CI_RUNS_ON selects more than one label: []; its runner is kept',
      );
      expect(result.stdout).toBe('alpha: visibility=public');
    });

    it('warns about a public repo whose runner is set', async () => {
      const github = { ...CURRENT_GITHUB, 'owner/gamma': facts('public', 'imac2') };
      const { result } = await run(['scan'], { github });
      expect(result.stdout).toBe('gamma: runner=imac2');
      expect(result.stderr).toBe(
        "thor-repo: gamma: public repo routes CI to runner imac2; a self-hosted runner must not run a fork's pull request",
      );
    });

    it('reports an entry without a repo and keeps its visibility and runner', async () => {
      const registry = 'repos:\n  - name: local\n    path: ~/repos/alpha\n    stack: [nmr]\n';
      const { result } = await run(['scan'], { registry });
      expect(result.stderr).toBe('thor-repo: local: no repo; its visibility and runner are kept');
      expect(result.stdout).toBe('');
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
      const clones = { delta: buildClone({ 'package.json': { vue: '3' } }) };
      const { registryText, result } = await run(['add', '~/repos/delta'], {
        clones,
        origins: { delta: 'git@github.com:owner/delta.git' },
      });
      expect(result.stdout).toBe('  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n    stack: [vue]');
      expect(result.stderr).toContain(
        'thor-repo: owner/delta: cannot read GitHub: no such repo; the entry omits visibility and runner',
      );
      expect(result.stderr).toContain('thor-repo: nothing written; pass --write');
      expect(registryText).toBe(REGISTRY);
      expect(result.status).toBe(0);
    });

    it('appends the entry under --write with its GitHub fields, reading an HTTPS origin', async () => {
      const clones = { delta: buildClone({}) };
      const origins = { delta: 'https://github.com/owner/delta' };
      const github = { 'owner/delta': facts('private', 'imac2') };
      const { registryText, result } = await run(['add', `${FAKE_HOME}/repos/delta`, '--write'], {
        clones,
        github,
        origins,
      });
      expect(result.status).toBe(0);
      expect(registryText).toBe(
        `${REGISTRY}  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n    visibility: private\n    runner: imac2\n`,
      );
    });

    it('omits runner when CI_RUNS_ON is unsupported', async () => {
      const github = {
        'owner/delta': { runner: undefined, runnerProblem: 'is empty', visibility: 'public' as const },
      };
      const { result } = await run(['add', '~/repos/delta'], {
        clones: { delta: buildClone({}) },
        github,
        origins: { delta: 'git@github.com:owner/delta.git' },
      });
      expect(result.stdout).toBe(
        '  - name: delta\n    path: ~/repos/delta\n    repo: owner/delta\n    visibility: public',
      );
      expect(result.stderr).toContain('thor-repo: owner/delta: CI_RUNS_ON is empty; the entry omits runner');
    });

    it('omits the GitHub fields for an origin hosted elsewhere, appending the entry under --write', async () => {
      // The reader knows the path, so a GitHub read would add `visibility` to the entry.
      const github = { 'ws/wthorsen-demos': facts('private') };
      const { registryText, result } = await run(['add', '~/repos/demos', '--write'], {
        clones: { demos: buildClone({}) },
        github,
        origins: { demos: 'https://u@bitbucket.org/ws/wthorsen-demos.git' },
      });
      expect(result.stdout).toBe('  - name: wthorsen-demos\n    path: ~/repos/demos');
      expect(result.stderr).toContain(
        `thor-repo: ${FAKE_HOME}/repos/demos: origin host bitbucket.org is not github.com; the entry omits repo, visibility, and runner`,
      );
      expect(result.stderr).not.toContain('GitHub');
      expect(registryText).toBe(`${REGISTRY}  - name: wthorsen-demos\n    path: ~/repos/demos\n`);
      expect(result.status).toBe(0);
    });

    it('does not match a new clone hosted elsewhere to an entry that also lacks repo', async () => {
      const registry = `${REGISTRY}  - name: epsilon\n    path: ~/repos/epsilon\n`;
      const { result } = await run(['add', '~/repos/demos'], {
        clones: { demos: buildClone({}) },
        origins: { demos: 'git@bitbucket.org:ws/demos.git' },
        registry,
      });
      expect(result.stdout).toBe('  - name: demos\n    path: ~/repos/demos');
      expect(result.status).toBe(0);
    });

    it('refuses a clone hosted elsewhere that is registered without repo, matching its path', async () => {
      const registry = `${REGISTRY}  - name: demos\n    path: ~/repos/demos\n`;
      const { result } = await run(['add', '~/repos/demos'], {
        clones: { demos: buildClone({}) },
        origins: { demos: 'git@bitbucket.org:ws/wthorsen-demos.git' },
        registry,
      });
      expect(result.stderr).toContain('already registered as demos');
      expect(result.status).toBe(1);
    });

    it('reports why the tracked files of a clone cannot be listed', async () => {
      const { registryText, result } = await run(['add', '~/repos/delta', '--write'], {
        clones: { delta: { files: {}, tracked: 'git ls-files was killed by SIGKILL' } },
        origins: { delta: 'git@github.com:owner/delta.git' },
      });
      expect(result.stderr).toBe(
        `thor-repo: cannot list the tracked files of ${FAKE_HOME}/repos/delta: git ls-files was killed by SIGKILL`,
      );
      expect(registryText).toBe(REGISTRY);
      expect(result.status).toBe(1);
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
      const clones = { alpha: CURRENT_CLONES.alpha, delta: buildClone({}) };
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
      [['list', '--clone', 'gone']],
      [['list', '--file', '']],
      [['list', 'extra']],
      [['scan', '--json']],
      [['scan', 'extra']],
      [['list', '--write']],
      [['add']],
      [['add', 'one', 'two']],
      [['move', 'alpha']],
      [['move', 'alpha', '~/x', 'extra']],
      [['apply-moves', 'alpha']],
    ])('rejects %j as a usage error', async (argv) => {
      const result = await runCaptured(argv);
      expect(result.stderr).toMatch(/^thor-repo: /);
      expect(result.stdout).toBe('');
      expect(result.status).toBe(2);
    });
  });
});

// region | Helpers

/** Returns the facts of a repo without a `CI_RUNS_ON` problem. */
function facts(visibility: GitHubFacts['visibility'], runner?: string): GitHubFacts {
  return { runner, runnerProblem: undefined, visibility };
}

/** Returns a reader over the given facts, failing for a repo that they lack. */
function fakeGitHub(byRepo: Record<string, GitHubFacts>): GitHubReader {
  return (repo) => byRepo[repo] ?? 'no such repo';
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
    github?: Record<string, GitHubFacts>;
    origins?: Record<string, string>;
    registry?: string;
  } = {},
): Promise<{ registryText: string; result: CapturedRun }> {
  using tree = createTempTree({ 'repos.yaml': setup.registry ?? REGISTRY }, { prefix: 'repo-tools-' });
  const file = tree.resolve('repos.yaml');
  const adapters = buildFakeAdapters(setup.clones ?? CURRENT_CLONES, setup.origins, setup.branch);
  const result = await runCaptured([...args.slice(0, 1), '--file', file, ...args.slice(1)], {
    adapters,
    env: { HOME: FAKE_HOME },
    github: fakeGitHub(setup.github ?? CURRENT_GITHUB),
  });
  return { registryText: fs.readFileSync(file, 'utf8'), result };
}

// endregion | Helpers
