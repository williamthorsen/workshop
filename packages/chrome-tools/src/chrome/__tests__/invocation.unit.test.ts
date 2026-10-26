import { describe, expect, it } from 'vitest';

import { createInvocation } from '../invocation.ts';
import { makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';

describe(createInvocation, () => {
  it('keeps the profiles under an absolute XDG_DATA_HOME', () => {
    expect(readProfilesDir({ HOME: '/home/someone', XDG_DATA_HOME: '/data' })).toBe('/data/thor-chrome/profiles');
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['relative', 'data'],
  ])('keeps the profiles under ~/.local/share when XDG_DATA_HOME is %s', (_description, dataHome) => {
    expect(readProfilesDir({ HOME: '/home/someone', XDG_DATA_HOME: dataHome })).toBe(
      '/home/someone/.local/share/thor-chrome/profiles',
    );
  });
});

// region | Helpers

/** Returns the profiles directory of an invocation whose environment contains only the given variables. */
function readProfilesDir(env: Record<string, string | undefined>): string {
  const fake = makeFakeThorChrome();
  return createInvocation(fake.captured.output, 'prose', { ...fake.deps, env }).profilesDir;
}

// endregion | Helpers
