import type { NpmClient } from '../../npm/createNpmClient.ts';

/** Returns an `NpmClient` that runs the given methods and throws on a call to any other. */
export function createNpmStub(overrides: Partial<NpmClient> = {}): NpmClient {
  return {
    addGithubTrust: overrides.addGithubTrust ?? throwUnexpected('addGithubTrust'),
    findVersion: overrides.findVersion ?? throwUnexpected('findVersion'),
    listTrust: overrides.listTrust ?? throwUnexpected('listTrust'),
    publish: overrides.publish ?? throwUnexpected('publish'),
    revokeTrust: overrides.revokeTrust ?? throwUnexpected('revokeTrust'),
    whoami: overrides.whoami ?? throwUnexpected('whoami'),
  };
}

// region | Helpers

/** Returns a method that throws an error naming itself. */
function throwUnexpected(method: keyof NpmClient): () => never {
  return () => {
    throw new Error(`Unexpected npm.${method} call`);
  };
}

// endregion | Helpers
