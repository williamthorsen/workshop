import { describe, expect, it } from 'vitest';

import { buildClone } from '../test-utils/fake-clones.ts';
import {
  ABSOLUTE_REGISTRY,
  CURRENT_CLONES,
  CURRENT_GITHUB,
  facts,
  PREFIXED_REGISTRY,
  REGISTRY,
} from '../test-utils/registry-fixtures.ts';
import { buildRegistryRunner } from '../test-utils/registry-runner.ts';

const run = buildRegistryRunner({ clones: CURRENT_CLONES, github: CURRENT_GITHUB, registry: REGISTRY });

describe('scan', () => {
  it('scans a registry of absolute paths without HOME', async () => {
    const { result } = await run(['scan'], { env: {}, registry: ABSOLUTE_REGISTRY });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('refuses a ~ path without HOME', async () => {
    const { result } = await run(['scan'], { env: {} });
    expect(result.stderr).toBe('thor-repo: cannot expand ~/repos/alpha: HOME is unset or empty');
    expect(result.status).toBe(1);
  });

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

  it('keeps the prefix of an entry whose stack, visibility, and runner it rewrites', async () => {
    const clones = { ...CURRENT_CLONES, alpha: buildClone({}) };
    const github = { ...CURRENT_GITHUB, 'owner/alpha': facts('public', 'm1') };
    const { registryText } = await run(['scan', '--write'], { clones, github, registry: PREFIXED_REGISTRY });
    expect(registryText).toBe(
      PREFIXED_REGISTRY.replace(
        '    visibility: private\n    runner: imac2\n    tags: [live]\n    stack: [nmr]\n',
        '    visibility: public\n    runner: m1\n    tags: [live]\n',
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
    expect(result.stderr).toContain('thor-repo: alpha: CI_RUNS_ON selects more than one label: []; its runner is kept');
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
