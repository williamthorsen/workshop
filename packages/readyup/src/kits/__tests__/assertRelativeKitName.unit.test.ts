import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { assertRelativeKitName } from '../assertRelativeKitName.ts';

describe(assertRelativeKitName, () => {
  it.each(['deploy', 'ops/deploy', 'teams/ops/rotate', '--odd-kit-name', 'a..b', '...'])(
    'accepts the kit name "%s"',
    (kitName) => {
      expect(() => assertRelativeKitName(kitName)).not.toThrow();
    },
  );

  it.each([
    ['a parent segment', '../etc/hosts'],
    ['a parent segment below a kit directory', 'ops/../../etc/hosts'],
    ['a trailing parent segment', 'ops/..'],
    ['a backslash-separated parent segment', '..\\etc\\hosts'],
    ['an absolute path', '/etc/hosts'],
    ['a leading backslash', '\\etc\\hosts'],
  ])('rejects %s', async (_label, kitName) => {
    const error = await captureError(Error, () => {
      assertRelativeKitName(kitName);
      return 0;
    });

    expect(error.message).toContain(kitName);
    expect(error.message).toContain('--file');
    expect(error.message).toContain('--from dir:');
  });
});
