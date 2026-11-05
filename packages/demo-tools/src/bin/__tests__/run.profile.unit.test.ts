import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDefaultProfileDir } from '../../aidemo/build-aidemo-env.ts';
import { run, type RunEffects } from '../run.ts';
import { createDemoRepo } from '../test-utils/create-demo-repo.ts';

const HOME = '/home/demo';

const EFFECTS: RunEffects = {
  arch: 'arm64',
  cwd: '/',
  env: {},
  findTrackedPaths: () => undefined,
  findUnignoredPaths: () => undefined,
  homeDir: HOME,
  platform: 'darwin',
  readSourceState: () => undefined,
  resolveVersion: () => '9.9.9',
};

describe('run login and profile', () => {
  describe.each([
    { args: ['login', '--url', 'https://app.example.com/'], command: 'login' },
    { args: ['profile', 'reset'], command: 'profile' },
  ])('$command', ({ args, command }) => {
    it('launches the aidemo command from the repository root on the default profile', async () => {
      using repo = createDemoRepo();

      const { exitCode, launch, stderr } = await run(args, { ...EFFECTS, cwd: repo.tree.resolve('demos') });

      const profileDir = resolveDefaultProfileDir(HOME, path.basename(repo.tree.dir));
      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(launch).toStrictEqual({
        args,
        bin: repo.tree.resolve('node_modules/@tandryukha/aidemo/bin/aidemo.mjs'),
        cwd: repo.tree.dir,
        env: { AIDEMO_CHROME_PROFILE: profileDir },
        profileDir,
      });
    });

    it('forwards the arguments after a literal --, help flags included', async () => {
      using repo = createDemoRepo();

      const { launch } = await run([command, '--', '--help'], { ...EFFECTS, cwd: repo.tree.dir });

      expect(launch?.args).toStrictEqual([command, '--help']);
    });

    it('does not check the ignore rules', async () => {
      using repo = createDemoRepo();

      const { stderr } = await run(args, {
        ...EFFECTS,
        cwd: repo.tree.dir,
        findUnignoredPaths: (_dir, paths) => paths,
      });

      expect(stderr).toBe('');
    });

    it('prints its own help on --help', async () => {
      const { exitCode, launch, stdout } = await run([command, '--help'], EFFECTS);

      expect(exitCode).toBe(0);
      expect(launch).toBeUndefined();
      expect(stdout).toContain(`Arguments for aidemo ${command}`);
    });

    it('reports a missing configuration with exit 1', async () => {
      const { exitCode, launch, stderr } = await run(args, EFFECTS);

      expect(exitCode).toBe(1);
      expect(launch).toBeUndefined();
      expect(stderr).toMatch(new RegExp(`^thor-demo ${command}: .config/thor-demo.yaml not found`));
    });
  });
});
