import { describe, expect, it } from 'vitest';

import { buildFakeAdapters, FAKE_HOME } from '../test-utils/fake-clones.ts';
import { CURRENT_CLONES, CURRENT_GITHUB, PREFIXED_REGISTRY, REGISTRY } from '../test-utils/registry-fixtures.ts';
import { buildRegistryRunner } from '../test-utils/registry-runner.ts';
import { runCaptured } from '../test-utils/run-captured.ts';

const run = buildRegistryRunner({ clones: CURRENT_CLONES, github: CURRENT_GITHUB, registry: REGISTRY });

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

  it('emits the prefix of an entry that declares one', async () => {
    const { result } = await run(['list', '--json'], { registry: PREFIXED_REGISTRY });
    expect(JSON.parse(result.stdout)).toStrictEqual({
      repos: [
        expect.objectContaining({ name: 'alpha', prefix: 'A' }),
        expect.not.objectContaining({ prefix: expect.anything() }),
        expect.objectContaining({ name: 'gamma', prefix: 'G' }),
      ],
    });
  });

  it('refuses a registry in which two prefixes differ only in case', async () => {
    const registry = PREFIXED_REGISTRY.replace('    repo: owner/beta\n', '    repo: owner/beta\n    prefix: a\n');
    const { result } = await run(['list'], { registry });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("entries 1 (alpha) and 2 (beta) declare the same prefix: 'A' and 'a'");
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
    expect((await run(['list'], { clones })).result.stdout).toBe(`${FAKE_HOME}/repos/alpha\n${FAKE_HOME}/repos/gamma`);
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
