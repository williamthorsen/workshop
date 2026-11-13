import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDefaultProfileDir } from '../../aidemo/build-aidemo-env.ts';
import { run } from '../run.ts';
import { buildRunEffects, STUB_HOME_DIR } from '../test-utils/build-run-effects.ts';
import { createDemoRepo } from '../test-utils/create-demo-repo.ts';
import { selectLaunch } from '../test-utils/select-request.ts';

describe('run login and profile', () => {
  describe.each([
    { args: ['login', '--url', 'https://app.example.com/'], command: 'login' },
    { args: ['profile', 'reset'], command: 'profile' },
  ])('$command', ({ args, command }) => {
    it('launches the aidemo command from the repository root on the default profile', async () => {
      using repo = createDemoRepo();

      const { exitCode, request, stderr } = await run(args, buildRunEffects({ cwd: repo.tree.resolve('demos') }));

      const profileDir = resolveDefaultProfileDir(STUB_HOME_DIR, path.basename(repo.tree.dir));
      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(selectLaunch(request)).toStrictEqual({
        args,
        bin: repo.tree.resolve('node_modules/@tandryukha/aidemo/bin/aidemo.mjs'),
        cwd: repo.tree.dir,
        env: { AIDEMO_CHROME_PROFILE: profileDir },
        profileDir,
      });
    });

    it('forwards the arguments after a literal --, help flags included', async () => {
      using repo = createDemoRepo();

      const { request } = await run([command, '--', '--help'], buildRunEffects({ cwd: repo.tree.dir }));

      expect(selectLaunch(request)?.args).toStrictEqual([command, '--help']);
    });

    it('does not check the ignore rules', async () => {
      using repo = createDemoRepo();

      const effects = buildRunEffects({
        cwd: repo.tree.dir,
        findUnignoredPaths: (_dir, paths) => paths,
      });
      const { stderr } = await run(args, effects);

      expect(stderr).toBe('');
    });

    it('prints its own help on --help', async () => {
      const { exitCode, request, stdout } = await run([command, '--help'], buildRunEffects());

      expect(exitCode).toBe(0);
      expect(request).toBeUndefined();
      expect(stdout).toContain(`Arguments for aidemo ${command}`);
    });

    it('reports a missing configuration with exit 1', async () => {
      const { exitCode, request, stderr } = await run(args, buildRunEffects());

      expect(exitCode).toBe(1);
      expect(request).toBeUndefined();
      expect(stderr).toMatch(new RegExp(`^thor-demo ${command}: .config/thor-demo.yaml not found`));
    });
  });
});
