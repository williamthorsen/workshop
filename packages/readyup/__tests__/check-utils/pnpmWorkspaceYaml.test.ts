import { describe, expect } from 'vitest';

import { readPnpmWorkspacePackages } from '../../src/check-utils/pnpmWorkspaceYaml.ts';
import { createTempDirTest, type TempDir } from '../helpers/tempDir.ts';

const it = createTempDirTest({ prefix: 'rdy-yaml-' });

describe(readPnpmWorkspacePackages, () => {
  it('returns a single unquoted item', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - packages/*', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*']);
  });

  it('returns multiple unquoted items in order', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - packages/*', '  - apps/*', '  - tools/*', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*', 'apps/*', 'tools/*']);
  });

  it('strips single quotes from items', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', "  - 'apps/*'", ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['apps/*']);
  });

  it('strips double quotes from items', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - "tools/*"', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['tools/*']);
  });

  it('handles mixed quoting in one file', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - packages/*', "  - 'apps/*'", '  - "tools/*"', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*', 'apps/*', 'tools/*']);
  });

  it('ignores full-line comments', ({ temp }) => {
    const yamlPath = writeYaml(
      temp,
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

  it('strips inline trailing comments on items', ({ temp }) => {
    const yamlPath = writeYaml(
      temp,
      ['packages:', '  - packages/* # primary packages', '  - apps/*    # apps', ''].join('\n'),
    );

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*', 'apps/*']);
  });

  it('preserves `#` inside single-quoted items (not treated as an inline comment)', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', "  - 'packages/foo#bar'", ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/foo#bar']);
  });

  it('preserves `#` inside double-quoted items (not treated as an inline comment)', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - "packages/foo#bar"', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/foo#bar']);
  });

  it('ignores blank lines between items', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - packages/*', '', '  - apps/*', '', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual(['packages/*', 'apps/*']);
  });

  it('ignores other top-level keys', ({ temp }) => {
    const yamlPath = writeYaml(
      temp,
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

  it('returns null when the `packages` key is absent', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['onlyBuiltDependencies:', '  - esbuild', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toBeNull();
  });

  it('returns an empty array when `packages` key has no sequence items', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', 'onlyBuiltDependencies:', '  - esbuild', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual([]);
  });

  it('returns an empty array when `packages` is the only key and has no items', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toStrictEqual([]);
  });

  it('throws on a negation pattern with a message naming the pattern and file path', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - packages/*', '  - "!packages/deprecated/*"', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/negation pattern "!packages\/deprecated\/\*"/);
    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(yamlPath);
    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/please open an issue/);
  });

  it('throws on an unquoted negation pattern', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - !packages/deprecated/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/negation pattern "!packages\/deprecated\/\*"/);
  });

  it('throws on a flow sequence for `packages`', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages: [packages/*, apps/*]', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/non-list value/);
    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(yamlPath);
  });

  it('throws on a flow sequence as an item value', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - [a, b]', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/flow sequence or mapping/);
  });

  it('throws on an anchor (&name) on an item', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - &anchor packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/anchor/);
  });

  it('throws on an alias (*name) on an item', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - *alias', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/alias/);
  });

  it('throws on a multi-document marker', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['---', 'packages:', '  - packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/multi-document/);
  });

  it('throws on a YAML tag (!!str)', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - !!str packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/YAML tag/);
  });

  it('throws on a folded block scalar (>)', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - >', '    packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/block scalar/);
  });

  it('throws on a literal block scalar (|)', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - |', '    packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/block scalar/);
  });

  it('throws when `packages` is a string instead of a list', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages: just-a-string', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/non-list value/);
  });

  it('throws when `packages` value is a mapping', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  key: value', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/non-list value/);
  });

  it('includes the offending line number and line text in the error message', ({ temp }) => {
    const yamlPath = writeYaml(temp, ['packages:', '  - packages/*', '  - [flow, sequence]', ''].join('\n'));

    const attempt = (): string[] | null => readPnpmWorkspacePackages(yamlPath);
    expect(attempt).toThrow(/pnpm-workspace\.yaml:3/);
    expect(attempt).toThrow(/\[flow, sequence]/);
  });
});

// region | Helpers

/** Writes the workspace manifest and returns its path, which the parser under test is given directly. */
function writeYaml(temp: TempDir, content: string): string {
  return temp.write('pnpm-workspace.yaml', content);
}

// endregion | Helpers
