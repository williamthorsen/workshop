import { describe, expect, it } from 'vitest';

import { readPnpmWorkspacePackages } from '../../src/check-utils/pnpmWorkspaceYaml.ts';
import { useTempDir } from '../helpers/tempDir.ts';

const temp = useTempDir({ prefix: 'rdy-yaml-' });

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

/** Writes the workspace manifest and returns its path, which the parser under test is given directly. */
function writeYaml(content: string): string {
  return temp.write('pnpm-workspace.yaml', content);
}

// endregion | Helpers
