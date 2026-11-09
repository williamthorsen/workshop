import { describe, expect, it } from 'vitest';

import { findPnpmCatalogVersion } from '../findPnpmCatalogVersion.ts';

describe(findPnpmCatalogVersion, () => {
  it('resolves a package from the default catalog', () => {
    const yaml = ['catalog:', '  esbuild: 0.28.2', '  zod: 4.4.3', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'zod')).toBe('4.4.3');
  });

  it('resolves a quoted scoped package name', () => {
    const yaml = ['catalog:', "  '@williamthorsen/toolbelt.errors': 0.6.1", ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, '@williamthorsen/toolbelt.errors')).toBe('0.6.1');
  });

  it('strips quotes from a value', () => {
    const yaml = ['catalog:', '  esbuild: "0.28.2"', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'esbuild')).toBe('0.28.2');
  });

  it('keeps a range operator on the resolved version', () => {
    const yaml = ['catalog:', '  react: ^19.0.0', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'react')).toBe('^19.0.0');
  });

  it('keeps a value with its own colon', () => {
    const yaml = ['catalog:', '  readyup: workspace:*', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'readyup')).toBe('workspace:*');
  });

  it('reads the default catalog under the name to which the shorthand expands', () => {
    const yaml = ['catalog:', '  esbuild: 0.28.2', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'esbuild', 'default')).toBe('0.28.2');
  });

  it('reads the default catalog from a `default` block under `catalogs:`', () => {
    const yaml = ['catalogs:', '  default:', '    esbuild: 0.28.2', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'esbuild')).toBe('0.28.2');
    expect(findPnpmCatalogVersion(yaml, 'esbuild', 'default')).toBe('0.28.2');
  });

  it('prefers the top-level block when both spellings of the default catalog are present', () => {
    const yaml = ['catalog:', '  esbuild: 0.28.2', 'catalogs:', '  default:', '    esbuild: 0.1.0', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'esbuild')).toBe('0.28.2');
  });

  it('resolves a package from a named catalog', () => {
    const yaml = ['catalogs:', '  react17:', '    react: ^17.0.2', '  react18:', '    react: ^18.2.0', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'react', 'react17')).toBe('^17.0.2');
    expect(findPnpmCatalogVersion(yaml, 'react', 'react18')).toBe('^18.2.0');
  });

  it('ignores blank lines, full-line comments, and inline comments', () => {
    const yaml = ['catalog:', '  # the bundler', '', '  esbuild: 0.28.2 # pinned', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'esbuild')).toBe('0.28.2');
  });

  it('returns undefined when the file declares no catalog', () => {
    const yaml = ['packages:', '  - packages/*', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'zod')).toBeUndefined();
  });

  it('returns undefined when the catalog does not name the package', () => {
    const yaml = ['catalog:', '  esbuild: 0.28.2', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'zod')).toBeUndefined();
  });

  it('returns undefined when the named catalog is absent', () => {
    const yaml = ['catalogs:', '  react17:', '    react: ^17.0.2', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'react', 'react18')).toBeUndefined();
  });

  it('returns undefined when the entry declares an empty value', () => {
    const yaml = ['catalog:', '  esbuild:', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'esbuild')).toBeUndefined();
  });

  it('does not read past its block into the next top-level key', () => {
    const yaml = ['catalog:', '  esbuild: 0.28.2', 'overrides:', '  zod: 4.4.3', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'zod')).toBeUndefined();
  });

  it('does not read a named catalog through the default catalog lookup', () => {
    const yaml = ['catalogs:', '  react17:', '    react: ^17.0.2', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'react')).toBeUndefined();
  });

  it('does not read one named catalog through another', () => {
    const yaml = ['catalogs:', '  react17:', '    react: ^17.0.2', '  vue:', '    vue: 3.5.0', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'vue', 'react17')).toBeUndefined();
  });

  it('does not treat a nested catalog name as a package of the catalogs block', () => {
    const yaml = ['catalogs:', '  react17:', '    react: ^17.0.2', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'react17', 'react17')).toBeUndefined();
  });

  it('reports no version for a value opening a construct that it cannot follow', () => {
    const yaml = [
      'catalog:',
      '  aliased: *pinned',
      '  anchored: &shared 19.0.0',
      '  flow: {version: 3.5.0}',
      '  sequence: [3.5.0]',
      '  folded: >',
      '  literal: |',
      '',
    ].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'aliased')).toBeUndefined();
    expect(findPnpmCatalogVersion(yaml, 'anchored')).toBeUndefined();
    expect(findPnpmCatalogVersion(yaml, 'flow')).toBeUndefined();
    expect(findPnpmCatalogVersion(yaml, 'sequence')).toBeUndefined();
    expect(findPnpmCatalogVersion(yaml, 'folded')).toBeUndefined();
    expect(findPnpmCatalogVersion(yaml, 'literal')).toBeUndefined();
  });

  it('reads a quoted value whose text opens with an indicator', () => {
    const yaml = ['catalog:', "  vitest: '>=1.2.3'", ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'vitest')).toBe('>=1.2.3');
  });

  it('reports no version rather than throwing on YAML that it cannot read', () => {
    const yaml = ['catalog: &shared', '  react: *pinned', '  vue: {version: 3.5.0}', ''].join('\n');

    expect(() => findPnpmCatalogVersion(yaml, 'react')).not.toThrow();
    expect(findPnpmCatalogVersion(yaml, 'react')).toBeUndefined();
    expect(findPnpmCatalogVersion(yaml, 'vue')).toBeUndefined();
  });
});
