import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { createNpmClient } from '../createNpmClient.ts';
import { createFakeNpm } from '../test-utils/createFakeNpm.ts';

describe(createNpmClient, () => {
  describe('whoami', () => {
    it('reports the logged-in user', () => {
      using npm = createFakeNpm();

      expect(createClient(npm).whoami()).toStrictEqual({ kind: 'logged-in', username: 'someone' });
      expect(npm.readCalls()).toStrictEqual([{ args: ['whoami'], cwd: npm.tree.dir }]);
    });

    it("reports a session that npm rejects, with npm's summary line", () => {
      using npm = createFakeNpm({ whoami: 'fail' });

      expect(createClient(npm).whoami()).toStrictEqual({
        kind: 'logged-out',
        detail: 'need auth This command requires you to be logged in.',
      });
    });

    it('reports npm as missing when PATH does not contain it', () => {
      using empty = createTempTree({ 'bin/': '' });
      const client = createNpmClient({ cwd: empty.dir, env: { PATH: empty.resolve('bin') } });

      expect(client.whoami()).toStrictEqual({ kind: 'missing' });
    });
  });

  describe('findVersion', () => {
    it.each([
      { view: 'found', expected: { kind: 'found' } },
      { view: 'absent', expected: { kind: 'absent' } },
      { view: 'fail', expected: { kind: 'failed', detail: 'request to registry failed' } },
    ] as const)('reports $view as $expected.kind', ({ view, expected }) => {
      using npm = createFakeNpm({ view });

      expect(createClient(npm).findVersion('@scope/name')).toStrictEqual(expected);
      expect(npm.readCalls()).toStrictEqual([
        { args: ['view', '@scope/name', 'version', '--json'], cwd: npm.tree.dir },
      ]);
    });
  });

  describe('publish', () => {
    it('publishes the directory with public access from the working directory', () => {
      using npm = createFakeNpm();

      expect(createClient(npm).publish('/some/dir')).toStrictEqual({ kind: 'published' });
      expect(npm.readCalls()).toStrictEqual([
        { args: ['publish', '/some/dir', '--access', 'public'], cwd: npm.tree.dir },
      ]);
    });

    it("reports a failed publish with npm's exit status", () => {
      using npm = createFakeNpm({ publish: 'fail' });

      expect(createClient(npm).publish('/some/dir')).toStrictEqual({ kind: 'failed', detail: 'exit 1' });
    });

    it('survives a SIGINT sent to its own process during the publish, reporting the signal', () => {
      using npm = createFakeNpm({ publish: 'interrupt' });
      const listenerCount = process.listenerCount('SIGINT');

      expect(createClient(npm).publish('/some/dir')).toStrictEqual({ kind: 'failed', detail: 'signal SIGINT' });
      expect(process.listenerCount('SIGINT')).toBe(listenerCount);
    });
  });
});

// region | Helpers

/** Creates a client that runs the fake in the fake's own directory. */
function createClient(npm: ReturnType<typeof createFakeNpm>): ReturnType<typeof createNpmClient> {
  return createNpmClient({ cwd: npm.tree.dir, env: npm.env });
}

// endregion | Helpers
