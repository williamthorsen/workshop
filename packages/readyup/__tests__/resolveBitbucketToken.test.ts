import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveBitbucketToken } from '../src/resolveBitbucketToken.ts';

describe(resolveBitbucketToken, () => {
  let originalToken: string | undefined;

  beforeEach(() => {
    originalToken = process.env.BITBUCKET_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.BITBUCKET_TOKEN;
    } else {
      process.env.BITBUCKET_TOKEN = originalToken;
    }
  });

  it('returns the env value when BITBUCKET_TOKEN is set and non-empty', () => {
    process.env.BITBUCKET_TOKEN = 'bb-secret-123';

    expect(resolveBitbucketToken()).toBe('bb-secret-123');
  });

  it('returns undefined when BITBUCKET_TOKEN is unset', () => {
    delete process.env.BITBUCKET_TOKEN;

    expect(resolveBitbucketToken()).toBeUndefined();
  });

  it('returns undefined when BITBUCKET_TOKEN is the empty string', () => {
    process.env.BITBUCKET_TOKEN = '';

    expect(resolveBitbucketToken()).toBeUndefined();
  });
});
