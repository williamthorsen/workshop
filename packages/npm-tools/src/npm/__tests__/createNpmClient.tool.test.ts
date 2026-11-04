import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { createNpmClient } from '../createNpmClient.ts';
import { createFakeNpm } from '../test-utils/createFakeNpm.ts';

describe(createNpmClient, () => {
  describe('addGithubTrust', () => {
    it('adds the trust with its environment and permission flags, answering npm with --yes', () => {
      using npm = createFakeNpm();
      const trust = {
        environment: 'npm',
        file: 'release.yaml',
        permissions: ['createPackage', 'createStagedPackage'],
        repository: 'owner/new',
      };

      expect(createClient(npm).addGithubTrust('@scope/name', trust)).toStrictEqual({ kind: 'added' });
      expect(npm.readCalls()).toStrictEqual([
        {
          args: [
            'trust',
            'github',
            '@scope/name',
            '--repo',
            'owner/new',
            '--file',
            'release.yaml',
            '--env',
            'npm',
            '--allow-publish',
            '--allow-stage-publish',
            '--yes',
          ],
          cwd: npm.tree.dir,
        },
      ]);
    });

    it("reports a failed add with npm's exit status", () => {
      using npm = createFakeNpm({ trustGithub: 'fail' });
      const trust = { file: 'release.yaml', permissions: ['createPackage'], repository: 'owner/new' };

      expect(createClient(npm).addGithubTrust('@scope/name', trust)).toStrictEqual({
        kind: 'failed',
        detail: 'exit 1',
      });
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

  describe('listTrust', () => {
    const entry = { id: 'trust-1', type: 'github', file: 'release.yaml', repository: 'owner/old', permissions: [] };
    const listing = `${JSON.stringify({ title: 'Authenticate', url: 'https://example.com' })}\n${JSON.stringify(entry, null, 2)}\n`;

    it.each([
      {
        platform: 'darwin',
        expected: (file: string) => ['-q', file, 'npm', 'trust', 'list', '@scope/name', '--json'],
      },
      {
        platform: 'linux',
        expected: (file: string) => ['--quiet', '--return', '--command', 'npm trust list @scope/name --json', file],
      },
    ] as const)('records the listing through the $platform form of script', ({ platform, expected }) => {
      using npm = createFakeNpm({ trustList: listing });

      expect(createClient(npm, platform).listTrust('@scope/name')).toStrictEqual({
        kind: 'listed',
        entries: [{ file: 'release.yaml', id: 'trust-1', permissions: [], repository: 'owner/old' }],
        otherCount: 0,
      });
      const [scriptArgs] = npm.readScriptCalls();
      const file = platform === 'darwin' ? scriptArgs?.[1] : scriptArgs?.[4];
      expect(scriptArgs).toStrictEqual(expected(file ?? ''));
      expect(npm.readCalls().map(({ args }) => args)).toStrictEqual([
        ['--version'],
        ['trust', 'list', '@scope/name', '--json'],
      ]);
    });

    it("reports a failed listing with npm's summary line from the transcript", () => {
      using npm = createFakeNpm({ trustList: 'fail' });

      expect(createClient(npm).listTrust('@scope/name')).toStrictEqual({
        kind: 'failed',
        detail: '403 Forbidden - GET https://registry.npmjs.org/-/package/x/trust',
      });
    });

    it('reports npm as missing when PATH does not contain it', () => {
      using empty = createTempTree({ 'bin/': '' });
      const client = createNpmClient({ cwd: empty.dir, env: { PATH: empty.resolve('bin') }, platform: 'darwin' });

      expect(client.listTrust('@scope/name')).toStrictEqual({ kind: 'missing' });
    });

    it('reports a missing script as a failure that names it', () => {
      using npm = createFakeNpm({ script: false });

      expect(createClient(npm).listTrust('@scope/name')).toStrictEqual({
        kind: 'failed',
        detail: 'script not found on PATH; recording npm output needs script(1)',
      });
    });

    it('refuses a platform that script(1) does not cover, without running npm', () => {
      using npm = createFakeNpm();

      expect(createClient(npm, 'win32').listTrust('@scope/name')).toStrictEqual({
        kind: 'failed',
        detail: 'recording npm output needs script(1), available on macOS and Linux',
      });
      expect(npm.readCalls()).toStrictEqual([]);
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

  describe('revokeTrust', () => {
    it('revokes the trust by its id', () => {
      using npm = createFakeNpm();

      expect(createClient(npm).revokeTrust('@scope/name', 'trust-1')).toStrictEqual({ kind: 'revoked' });
      expect(npm.readCalls()).toStrictEqual([
        { args: ['trust', 'revoke', '@scope/name', '--id', 'trust-1'], cwd: npm.tree.dir },
      ]);
    });

    it("reports a failed revoke with npm's exit status", () => {
      using npm = createFakeNpm({ trustRevoke: 'fail' });

      expect(createClient(npm).revokeTrust('@scope/name', 'trust-1')).toStrictEqual({
        kind: 'failed',
        detail: 'exit 1',
      });
    });
  });

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
});

// region | Helpers

/** Creates a client that runs the fake in the fake's own directory, recording through the given platform's script. */
function createClient(
  npm: ReturnType<typeof createFakeNpm>,
  platform: NodeJS.Platform = 'darwin',
): ReturnType<typeof createNpmClient> {
  return createNpmClient({ cwd: npm.tree.dir, env: npm.env, platform });
}

// endregion | Helpers
