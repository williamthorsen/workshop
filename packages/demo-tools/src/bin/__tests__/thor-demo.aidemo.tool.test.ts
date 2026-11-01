import { describe, expect, it } from 'vitest';

import { createDemoRepo, FAKE_AIDEMO_STARTED } from '../test-utils/create-demo-repo.ts';
import { runThorDemo } from '../test-utils/run-thor-demo.ts';

describe('thor-demo with an installed aidemo', () => {
  it.each([['render'], ['probe']])(
    'runs aidemo %s on the demo from the repository root, with the options after it',
    (command) => {
      using repo = createDemoRepo();

      const { status } = runThorDemo([command, 'quickstart', '--tts', 'local'], repo.tree.resolve('demos'));

      expect(status).toBe(0);
      expect(repo.readCalls()).toStrictEqual([
        {
          args: [command, repo.tree.resolve('demos/quickstart'), '--tts', 'local'],
          cwd: repo.tree.dir,
          env: {},
        },
      ]);
    },
  );

  it('removes an inherited OpenAI variable and passes a declared one', () => {
    using repo = createDemoRepo({
      config: 'aidemo:\n  env:\n    AIDEMO_TTS_PROVIDER: local\n    OPENAI_BASE_URL: http://local\n',
    });

    runThorDemo(['probe', 'quickstart'], repo.tree.dir, { OPENAI_API_KEY: 'sk-x', OPENAI_BASE_URL: 'http://remote' });

    expect(repo.readCalls()[0]?.env).toStrictEqual({
      AIDEMO_TTS_PROVIDER: 'local',
      OPENAI_BASE_URL: 'http://local',
    });
  });

  it("exits with aidemo's exit code", () => {
    using repo = createDemoRepo({ exitCode: 3 });

    expect(runThorDemo(['render', 'quickstart'], repo.tree.dir).status).toBe(3);
  });

  it("writes nothing to stdout under mcp except aidemo's output", () => {
    using repo = createDemoRepo({ stdout: '{"jsonrpc":"2.0"}\n' });

    const { status, stdout } = runThorDemo(['mcp'], repo.tree.dir);

    expect(status).toBe(0);
    expect(stdout).toBe('{"jsonrpc":"2.0"}\n');
    expect(repo.readCalls()).toMatchObject([{ args: ['mcp'], cwd: repo.tree.dir }]);
  });

  it('warns about a .env that restores an OpenAI variable before aidemo starts', () => {
    using repo = createDemoRepo({ envFile: 'OPENAI_API_KEY=sk-x\n' });

    const { status, stderr } = runThorDemo(['mcp'], repo.tree.dir);

    expect(status).toBe(0);
    const warningIndex = stderr.indexOf('sets OPENAI_API_KEY');
    expect(warningIndex).toBeGreaterThan(-1);
    expect(warningIndex).toBeLessThan(stderr.indexOf(FAKE_AIDEMO_STARTED));
  });

  it('exits 1 without running anything when aidemo is not installed', () => {
    using repo = createDemoRepo({ withoutAidemo: true });

    const { status, stderr } = runThorDemo(['render', 'quickstart'], repo.tree.dir);

    expect(status).toBe(1);
    expect(stderr).toContain('pnpm add --save-dev @tandryukha/aidemo');
    expect(repo.readCalls()).toStrictEqual([]);
  });
});
