import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it } from 'vitest';

import { findPnpmCatalogVersion, readPnpmWorkspacePackages } from '../pnpmWorkspaceYaml.ts';

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

  it('keeps a value carrying its own colon', () => {
    const yaml = ['catalog:', '  readyup: workspace:*', ''].join('\n');

    expect(findPnpmCatalogVersion(yaml, 'readyup')).toBe('workspace:*');
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

  it('reports no version rather than throwing on YAML it cannot read', () => {
    const yaml = ['catalog: &shared', '  react: *pinned', '  vue: {version: 3.5.0}', ''].join('\n');

    expect(() => findPnpmCatalogVersion(yaml, 'react')).not.toThrow();
    expect(findPnpmCatalogVersion(yaml, 'missing')).toBeUndefined();
  });
});

describe(readPnpmWorkspacePackages, () => {
  it('returns a single unquoted item', () => {
    const yamlPath = writeYaml(['packages:', '  - packages/*', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*']);
  });

  it('returns multiple unquoted items in order', () => {
    const yamlPath = writeYaml(['packages:', '  - packages/*', '  - apps/*', '  - tools/*', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*', 'apps/*', 'tools/*']);
  });

  it('strips single quotes from items', () => {
    const yamlPath = writeYaml(['packages:', "  - 'apps/*'", ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['apps/*']);
  });

  it('strips double quotes from items', () => {
    const yamlPath = writeYaml(['packages:', '  - "tools/*"', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['tools/*']);
  });

  it('handles mixed quoting in one file', () => {
    const yamlPath = writeYaml(['packages:', '  - packages/*', "  - 'apps/*'", '  - "tools/*"', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*', 'apps/*', 'tools/*']);
  });

  it('ignores full-line comments', () => {
    const yamlPath = writeYaml(
      [
        '# a leading comment',
        'packages:',
        '  # commented item',
        '  - packages/*',
        '  # another comment',
        '  - apps/*',
        '',
      ].join('\n'),
    );

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*', 'apps/*']);
  });

  it('strips inline trailing comments on items', () => {
    const yamlPath = writeYaml(
      ['packages:', '  - packages/* # primary packages', '  - apps/*    # apps', ''].join('\n'),
    );

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*', 'apps/*']);
  });

  it('preserves `#` inside single-quoted items (not treated as an inline comment)', () => {
    const yamlPath = writeYaml(['packages:', "  - 'packages/foo#bar'", ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/foo#bar']);
  });

  it('preserves `#` inside double-quoted items (not treated as an inline comment)', () => {
    const yamlPath = writeYaml(['packages:', '  - "packages/foo#bar"', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/foo#bar']);
  });

  it('ignores blank lines between items', () => {
    const yamlPath = writeYaml(['packages:', '  - packages/*', '', '  - apps/*', '', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*', 'apps/*']);
  });

  it('ignores other top-level keys', () => {
    const yamlPath = writeYaml(
      [
        'onlyBuiltDependencies:',
        '  - esbuild',
        'packages:',
        '  - packages/*',
        'packageExtensions:',
        '  foo: bar',
        '',
      ].join('\n'),
    );

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*']);
  });

  it('returns null when the `packages` key is absent', () => {
    const yamlPath = writeYaml(['onlyBuiltDependencies:', '  - esbuild', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toBeNull();
  });

  it('returns an empty array when `packages` key has no sequence items', () => {
    const yamlPath = writeYaml(['packages:', 'onlyBuiltDependencies:', '  - esbuild', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual([]);
  });

  it('returns an empty array when `packages` is the only key and has no items', () => {
    const yamlPath = writeYaml(['packages:', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual([]);
  });

  it('throws on a negation pattern with a message naming the pattern and file path', () => {
    const yamlPath = writeYaml(['packages:', '  - packages/*', '  - "!packages/deprecated/*"', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/negation pattern "!packages\/deprecated\/\*"/);
    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(yamlPath);
    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/please open an issue/);
  });

  it('throws on an unquoted negation pattern', () => {
    const yamlPath = writeYaml(['packages:', '  - !packages/deprecated/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/negation pattern "!packages\/deprecated\/\*"/);
  });

  it('throws on a flow sequence for `packages`', () => {
    const yamlPath = writeYaml(['packages: [packages/*, apps/*]', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/non-list value/);
    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(yamlPath);
  });

  it('throws on a flow sequence as an item value', () => {
    const yamlPath = writeYaml(['packages:', '  - [a, b]', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/flow sequence or mapping/);
  });

  it('throws on an anchor (&name) on an item', () => {
    const yamlPath = writeYaml(['packages:', '  - &anchor packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/anchor/);
  });

  it('throws on an alias (*name) on an item', () => {
    const yamlPath = writeYaml(['packages:', '  - *alias', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/alias/);
  });

  it('throws on a multi-document marker', () => {
    const yamlPath = writeYaml(['---', 'packages:', '  - packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/multi-document/);
  });

  it('throws on a YAML tag (!!str)', () => {
    const yamlPath = writeYaml(['packages:', '  - !!str packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/YAML tag/);
  });

  it('throws on a folded block scalar (>)', () => {
    const yamlPath = writeYaml(['packages:', '  - >', '    packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/block scalar/);
  });

  it('throws on a literal block scalar (|)', () => {
    const yamlPath = writeYaml(['packages:', '  - |', '    packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/block scalar/);
  });

  it('throws when `packages` is a string instead of a list', () => {
    const yamlPath = writeYaml(['packages: just-a-string', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/non-list value/);
  });

  it('throws when `packages` value is a mapping', () => {
    const yamlPath = writeYaml(['packages:', '  key: value', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/non-list value/);
  });

  it('includes the offending line number and line text in the error message', () => {
    const yamlPath = writeYaml(['packages:', '  - packages/*', '  - [flow, sequence]', ''].join('\n'));

    const attempt = (): string[] | null => readPnpmWorkspacePackages(yamlPath);
    expect(attempt).toThrow(/pnpm-workspace\.yaml:3/);
    expect(attempt).toThrow(/\[flow, sequence]/);
  });
});

// region | Helpers

/** Writes the workspace manifest into a tree of its own and returns its path, which the parser is given directly. */
function writeYaml(content: string): string {
  const tree = disposeOnTestFinished(createTempTree({ 'pnpm-workspace.yaml': content }, { prefix: 'rdy-yaml-' }));
  return tree.resolve('pnpm-workspace.yaml');
}

// endregion | Helpers
