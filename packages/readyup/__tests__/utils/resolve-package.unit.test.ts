import { describe, expect, it } from 'vitest';

import { isPackageInstalled } from '../../src/utils/resolve-package.ts';

describe(isPackageInstalled, () => {
  it('reports a package the project depends on as installed', () => {
    expect(isPackageInstalled('zod')).toBe(true);
  });

  // `readyup` publishes only `import` and `types` conditions, so a require-based resolver reaches its
  // package.json and then fails on conditions. An ESM-only package is installed all the same.
  it('reports an import-only package as installed', () => {
    expect(isPackageInstalled('readyup')).toBe(true);
  });

  it('reports an uninstalled package as not installed', () => {
    expect(isPackageInstalled('readyup-package-that-does-not-exist')).toBe(false);
  });
});
