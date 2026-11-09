import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { run, type RunEffects } from '../run.ts';
import { createTextBuffer } from '../test-utils/createTextBuffer.ts';

const LONG_DESCRIPTION = `A package whose description runs on ${'and on '.repeat(20)}`;

const WORKSPACE = {
  'package.json': '{ "name": "root", "private": true }\n',
  'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
  'packages/alpha/package.json': `{ "name": "alpha", "version": "1.0.0", "description": "${LONG_DESCRIPTION}" }\n`,
  'packages/beta/package.json': '{ "name": "beta", "version": "0.1.0", "private": true }\n',
};

describe('thor-npm list-packages', () => {
  it('cuts table lines to 120 columns on a wide terminal', async () => {
    using tree = createTempTree(WORKSPACE);

    const { exitCode, stderr, stdout } = await runInTree(tree, ['list-packages'], { columns: 200, isTty: true });

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    const lines = stdout.trimEnd().split('\n');
    expect(lines[0]).toBe('PUBLISH  NAME   VERSION  DIRECTORY  DESCRIPTION');
    expect(lines[1]).toHaveLength(120);
    expect(lines[1]).toMatch(/^yes {6}alpha {2}1\.0\.0 {4}alpha {6}A package .*…$/);
    expect(lines[2]).toBe('no       beta   0.1.0    beta');
  });

  it('cuts table lines to the width of a terminal narrower than 120 columns', async () => {
    using tree = createTempTree(WORKSPACE);

    const { stdout } = await runInTree(tree, ['list-packages'], { columns: 60, isTty: true });

    expect(stdout.split('\n', 2)[1]).toHaveLength(60);
  });

  it('leaves table lines whole when stdout is not a terminal', async () => {
    using tree = createTempTree(WORKSPACE);

    const { stdout } = await runInTree(tree, ['list-packages'], { columns: undefined, isTty: false });

    expect(stdout).toContain(LONG_DESCRIPTION.trimEnd());
  });

  it('prints the packages as JSON under --json', async () => {
    using tree = createTempTree(WORKSPACE);

    const { exitCode, stdout } = await runInTree(tree, ['list-packages', '--json'], { columns: 80, isTty: true });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toStrictEqual({
      packages: [
        {
          name: 'alpha',
          version: '1.0.0',
          private: false,
          directory: 'packages/alpha',
          description: LONG_DESCRIPTION,
        },
        { name: 'beta', version: '0.1.0', private: true, directory: 'packages/beta', description: null },
      ],
    });
  });

  it('reports a directory outside any pnpm workspace and exits 1', async () => {
    using tree = createTempTree({ 'package.json': '{ "name": "standalone" }\n' });

    const { exitCode, stderr, stdout } = await runInTree(tree, ['list-packages'], { columns: 80, isTty: true });

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toBe(
      `thor-npm list-packages: no pnpm-workspace.yaml found in ${tree.dir} or any parent directory; run it from inside a pnpm workspace\n`,
    );
  });

  it('reports an empty workspace and prints an empty list', async () => {
    using tree = createTempTree({ 'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n" });

    const { exitCode, stderr, stdout } = await runInTree(tree, ['list-packages', '--json'], {
      columns: 80,
      isTty: true,
    });

    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/^thor-npm list-packages: the workspace at .* has no packages \(no-package\)\n$/);
    expect(JSON.parse(stdout)).toStrictEqual({ packages: [] });
  });

  it('reports a manifest that does not parse and exits 1', async () => {
    using tree = createTempTree({
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
      'packages/broken/package.json': '{ not json',
    });

    const { exitCode, stderr } = await runInTree(tree, ['list-packages'], { columns: 80, isTty: true });

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/^thor-npm: could not read .*packages\/broken\/package\.json: /);
  });

  it('prints its help with an example', async () => {
    using tree = createTempTree(WORKSPACE);

    const { exitCode, stdout } = await runInTree(tree, ['list-packages', '--help'], { columns: 80, isTty: true });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: thor-npm list-packages');
    expect(stdout).toContain('--json');
    expect(stdout).toContain('Examples:');
  });
});

// region | Helpers

/** Runs `thor-npm` with the tree's root as the working directory and a stdout of the given kind. */
async function runInTree(
  tree: TempTree,
  args: readonly string[],
  terminal: { readonly columns: number | undefined; readonly isTty: boolean },
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const stderr = createTextBuffer();
  const stdout = createTextBuffer();
  const effects: RunEffects = {
    createTempDir: () => {
      throw new Error('Unexpected createTempDir call');
    },
    cwd: () => tree.dir,
    isStdinTty: () => false,
    isStdoutTty: () => terminal.isTty,
    npm: {
      addGithubTrust: () => ({ kind: 'failed', detail: 'unexpected addGithubTrust' }),
      findVersion: () => ({ kind: 'failed', detail: 'unexpected findVersion' }),
      listTrust: () => ({ kind: 'failed', detail: 'unexpected listTrust' }),
      publish: () => ({ kind: 'failed', detail: 'unexpected publish' }),
      revokeTrust: () => ({ kind: 'failed', detail: 'unexpected revokeTrust' }),
      whoami: () => ({ kind: 'missing' }),
    },
    readAnswer: () => Promise.resolve(undefined),
    resolveVersion: () => '0.0.0',
    stdoutColumns: () => terminal.columns,
  };

  const exitCode = await run(args, effects, { stderr, stdout });
  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

// endregion | Helpers
