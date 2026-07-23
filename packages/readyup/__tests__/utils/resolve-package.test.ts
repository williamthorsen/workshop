import { describe, expect, it } from 'vitest';

import { isPackageResolvable } from '../../src/utils/resolve-package.ts';

describe(isPackageResolvable, () => {
  it('reports a package the project depends on as resolvable', () => {
    expect(isPackageResolvable('zod')).toBe(true);
  });

  it('reports an uninstalled package as unresolvable', () => {
    expect(isPackageResolvable('readyup-package-that-does-not-exist')).toBe(false);
  });
});
