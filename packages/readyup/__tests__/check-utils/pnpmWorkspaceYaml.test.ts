import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readPnpmWorkspacePackages } from '../../src/check-utils/pnpmWorkspaceYaml.ts';

let tempDir: string;
let yamlPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'rdy-yaml-'));
  yamlPath = join(tempDir, 'pnpm-workspace.yaml');
});

afterEach(() => {
  // Temp directory is cleaned up by the OS; leaving it in place keeps the test fast.
});

function writeYaml(content: string): void {
  writeFileSync(yamlPath, content);
}

describe(readPnpmWorkspacePackages, () => {
  it('returns a single unquoted item', () => {
    writeYaml(['packages:', '  - packages/*', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual(['packages/*']);
  });

  it('returns multiple unquoted items in order', () => {
    writeYaml(['packages:', '  - packages/*', '  - apps/*', '  - tools/*', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual(['packages/*', 'apps/*', 'tools/*']);
  });

  it('strips single quotes from items', () => {
    writeYaml(['packages:', "  - 'apps/*'", ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual(['apps/*']);
  });

  it('strips double quotes from items', () => {
    writeYaml(['packages:', '  - "tools/*"', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual(['tools/*']);
  });

  it('handles mixed quoting in one file', () => {
    writeYaml(['packages:', '  - packages/*', "  - 'apps/*'", '  - "tools/*"', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual(['packages/*', 'apps/*', 'tools/*']);
  });

  it('ignores full-line comments', () => {
    writeYaml(
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

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual(['packages/*', 'apps/*']);
  });

  it('strips inline trailing comments on items', () => {
    writeYaml(['packages:', '  - packages/* # primary packages', '  - apps/*    # apps', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual(['packages/*', 'apps/*']);
  });

  it('ignores blank lines between items', () => {
    writeYaml(['packages:', '  - packages/*', '', '  - apps/*', '', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual(['packages/*', 'apps/*']);
  });

  it('ignores other top-level keys', () => {
    writeYaml(
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

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual(['packages/*']);
  });

  it('returns null when the `packages` key is absent', () => {
    writeYaml(['onlyBuiltDependencies:', '  - esbuild', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toBeNull();
  });

  it('returns an empty array when `packages` key has no sequence items', () => {
    writeYaml(['packages:', 'onlyBuiltDependencies:', '  - esbuild', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual([]);
  });

  it('returns an empty array when `packages` is the only key and has no items', () => {
    writeYaml(['packages:', ''].join('\n'));

    expect(readPnpmWorkspacePackages(yamlPath)).toEqual([]);
  });

  it('throws on a negation pattern with a message naming the pattern and file path', () => {
    writeYaml(['packages:', '  - packages/*', '  - "!packages/deprecated/*"', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/negation pattern "!packages\/deprecated\/\*"/);
    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(yamlPath);
    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/please open an issue/);
  });

  it('throws on an unquoted negation pattern', () => {
    writeYaml(['packages:', '  - !packages/deprecated/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/negation pattern "!packages\/deprecated\/\*"/);
  });

  it('throws on a flow sequence for `packages`', () => {
    writeYaml(['packages: [packages/*, apps/*]', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/non-list value/);
    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(yamlPath);
  });

  it('throws on a flow sequence as an item value', () => {
    writeYaml(['packages:', '  - [a, b]', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/flow sequence or mapping/);
  });

  it('throws on an anchor (&name) on an item', () => {
    writeYaml(['packages:', '  - &anchor packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/anchor/);
  });

  it('throws on an alias (*name) on an item', () => {
    writeYaml(['packages:', '  - *alias', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/alias/);
  });

  it('throws on a multi-document marker', () => {
    writeYaml(['---', 'packages:', '  - packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/multi-document/);
  });

  it('throws on a YAML tag (!!str)', () => {
    writeYaml(['packages:', '  - !!str packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/YAML tag/);
  });

  it('throws on a folded block scalar (>)', () => {
    writeYaml(['packages:', '  - >', '    packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/block scalar/);
  });

  it('throws on a literal block scalar (|)', () => {
    writeYaml(['packages:', '  - |', '    packages/*', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/block scalar/);
  });

  it('throws when `packages` is a string instead of a list', () => {
    writeYaml(['packages: just-a-string', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/non-list value/);
  });

  it('throws when `packages` value is a mapping', () => {
    writeYaml(['packages:', '  key: value', ''].join('\n'));

    expect(() => readPnpmWorkspacePackages(yamlPath)).toThrow(/non-list value/);
  });

  it('includes the offending line number and line text in the error message', () => {
    writeYaml(['packages:', '  - packages/*', '  - [flow, sequence]', ''].join('\n'));

    const attempt = (): string[] | null => readPnpmWorkspacePackages(yamlPath);
    expect(attempt).toThrow(/pnpm-workspace\.yaml:3/);
    expect(attempt).toThrow(/\[flow, sequence\]/);
  });
});
