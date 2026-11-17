import { describe, expect, it } from 'vitest';

import type { GithubTrust, NpmClient } from '../../../npm/createNpmClient.ts';
import { createNpmStub } from '../createNpmStub.ts';

const TRUST: GithubTrust = { file: 'release.yaml', permissions: [], repository: 'owner/repo' };

const CALLS: Array<{ method: keyof NpmClient; call: (npm: NpmClient) => unknown }> = [
  { method: 'addGithubTrust', call: (npm) => npm.addGithubTrust('pkg', TRUST) },
  { method: 'findVersion', call: (npm) => npm.findVersion('pkg') },
  { method: 'listTrust', call: (npm) => npm.listTrust('pkg') },
  { method: 'publish', call: (npm) => npm.publish('dir') },
  { method: 'revokeTrust', call: (npm) => npm.revokeTrust('pkg', 'id') },
  { method: 'whoami', call: (npm) => npm.whoami() },
];

describe(createNpmStub, () => {
  it('runs a method that the overrides give', () => {
    const npm = createNpmStub({ whoami: () => ({ kind: 'logged-in', username: 'someone' }) });

    expect(npm.whoami()).toStrictEqual({ kind: 'logged-in', username: 'someone' });
  });

  it.each(CALLS)('throws on a call to $method when the overrides do not give it', ({ call, method }) => {
    expect(() => call(createNpmStub())).toThrow(new Error(`Unexpected npm.${method} call`));
  });
});
