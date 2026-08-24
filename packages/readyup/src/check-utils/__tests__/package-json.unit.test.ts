import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import { hasDevDependency, hasMinDevDependencyVersion, hasPackageJsonField, readPackageJson } from '../package-json.ts';

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-pkg-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(readPackageJson, () => {
  it('returns the parsed package.json', ({ temp }) => {
    writePackageJson(temp, { name: 'test-pkg', version: '1.0.0' });

    const result = readPackageJson();

    expect(result).toStrictEqual({ name: 'test-pkg', version: '1.0.0' });
  });

  it('returns undefined when package.json does not exist', () => {
    expect(readPackageJson()).toBeUndefined();
  });

  it('returns undefined when package.json is not an object', ({ temp }) => {
    temp.write('package.json', '"not an object"');

    expect(readPackageJson()).toBeUndefined();
  });
});

describe(hasPackageJsonField, () => {
  it('returns true when the field exists', ({ temp }) => {
    writePackageJson(temp, { type: 'module' });

    expect(hasPackageJsonField('type')).toBe(true);
  });

  it('returns false when the field does not exist', ({ temp }) => {
    writePackageJson(temp, {});

    expect(hasPackageJsonField('type')).toBe(false);
  });

  it('returns true when the field matches the expected value', ({ temp }) => {
    writePackageJson(temp, { type: 'module' });

    expect(hasPackageJsonField('type', 'module')).toBe(true);
  });

  it('returns false when the field does not match the expected value', ({ temp }) => {
    writePackageJson(temp, { type: 'commonjs' });

    expect(hasPackageJsonField('type', 'module')).toBe(false);
  });

  it('returns false when package.json does not exist', () => {
    expect(hasPackageJsonField('type')).toBe(false);
  });
});

describe(hasDevDependency, () => {
  it('returns true when the dependency is present', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: '^1.0.0' } });

    expect(hasDevDependency('vitest')).toBe(true);
  });

  it('returns false when the dependency is absent', ({ temp }) => {
    writePackageJson(temp, { devDependencies: {} });

    expect(hasDevDependency('vitest')).toBe(false);
  });

  it('returns false when devDependencies is missing', ({ temp }) => {
    writePackageJson(temp, {});

    expect(hasDevDependency('vitest')).toBe(false);
  });
});

describe(hasMinDevDependencyVersion, () => {
  it('returns true when the version meets the minimum', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: '^2.0.0' } });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(true);
  });

  it('returns false when the version is below the minimum', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: '^0.34.0' } });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(false);
  });

  it('returns false when the dependency is not present', ({ temp }) => {
    writePackageJson(temp, { devDependencies: {} });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(false);
  });

  it('returns true for a workspace specifier naming no version', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { core: 'workspace:*' } });

    expect(hasMinDevDependencyVersion('core', '99.0.0')).toBe(true);
  });

  it('returns true for a workspace specifier naming a version below the minimum', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { core: 'workspace:^1.2.3' } });

    expect(hasMinDevDependencyVersion('core', '2.0.0')).toBe(true);
  });

  it('returns true when the default catalog resolves the specifier above the minimum', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: 'catalog:' } });
    writeWorkspaceYaml(temp, ['catalog:', '  vitest: 2.1.0', ''].join('\n'));

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(true);
  });

  it('returns false when the default catalog resolves the specifier below the minimum', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: 'catalog:' } });
    writeWorkspaceYaml(temp, ['catalog:', '  vitest: 0.34.0', ''].join('\n'));

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(false);
  });

  it('measures a catalog version carrying a range operator', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { react: 'catalog:' } });
    writeWorkspaceYaml(temp, ['catalog:', '  react: ^19.0.0', ''].join('\n'));

    expect(hasMinDevDependencyVersion('react', '19.0.0')).toBe(true);
    expect(hasMinDevDependencyVersion('react', '20.0.0')).toBe(false);
  });

  it('resolves a named catalog specifier through its own block', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { react: 'catalog:react17' } });
    writeWorkspaceYaml(
      temp,
      ['catalog:', '  react: 19.0.0', 'catalogs:', '  react17:', '    react: 17.0.2', ''].join('\n'),
    );

    expect(hasMinDevDependencyVersion('react', '17.0.0')).toBe(true);
    expect(hasMinDevDependencyVersion('react', '18.0.0')).toBe(false);
  });

  it('returns false for a catalog specifier when no workspace manifest is present', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: 'catalog:' } });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(false);
  });

  it('returns false when the catalog names no entry for the dependency', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: 'catalog:' } });
    writeWorkspaceYaml(temp, ['catalog:', '  esbuild: 0.28.2', ''].join('\n'));

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(false);
  });

  it('returns false when the named catalog is absent', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { react: 'catalog:react17' } });
    writeWorkspaceYaml(temp, ['catalog:', '  react: 19.0.0', ''].join('\n'));

    expect(hasMinDevDependencyVersion('react', '1.0.0')).toBe(false);
  });

  it('returns true when a catalog entry resolves to a workspace specifier', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { core: 'catalog:' } });
    writeWorkspaceYaml(temp, ['catalog:', '  core: workspace:*', ''].join('\n'));

    expect(hasMinDevDependencyVersion('core', '99.0.0')).toBe(true);
  });

  it('returns true when the exempt predicate matches', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { core: 'link:../core' } });

    expect(
      hasMinDevDependencyVersion('core', '1.0.0', {
        exempt: (specifier) => specifier.startsWith('link:'),
      }),
    ).toBe(true);
  });

  it('passes the exempt predicate the specifier as declared, not the version a catalog resolves', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: 'catalog:' } });
    writeWorkspaceYaml(temp, ['catalog:', '  vitest: 0.34.0', ''].join('\n'));
    const seen: string[] = [];

    const result = hasMinDevDependencyVersion('vitest', '1.0.0', {
      exempt: (specifier) => {
        seen.push(specifier);
        return false;
      },
    });

    expect(seen).toStrictEqual(['catalog:']);
    expect(result).toBe(false);
  });

  it('measures a specifier naming fewer than three version segments', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { nmr: '7', eslintConfig: '^6' } });

    expect(hasMinDevDependencyVersion('nmr', '7.0.0')).toBe(true);
    expect(hasMinDevDependencyVersion('eslintConfig', '6.0.0')).toBe(true);
    expect(hasMinDevDependencyVersion('eslintConfig', '7.0.0')).toBe(false);
  });

  it('measures a prerelease specifier by its release version', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: '1.2.3-beta.1' } });

    expect(hasMinDevDependencyVersion('vitest', '1.2.3')).toBe(true);
    expect(hasMinDevDependencyVersion('vitest', '1.3.0')).toBe(false);
  });

  it('measures a specifier whose version follows an alias protocol', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: 'npm:vitest-fork@1.2.3' } });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(true);
    expect(hasMinDevDependencyVersion('vitest', '2.0.0')).toBe(false);
  });

  it('measures a specifier behind a comparison operator', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: '>=1.2.3', esbuild: '~0.28.2' } });

    expect(hasMinDevDependencyVersion('vitest', '1.2.3')).toBe(true);
    expect(hasMinDevDependencyVersion('esbuild', '0.28.0')).toBe(true);
  });

  it('returns false when the version range has no extractable version', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: 'latest' } });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(false);
  });
});

// region | Helpers

/** Writes the project manifest the check-utils under test read from the working directory. */
function writePackageJson(temp: TempTree, content: Record<string, unknown>): void {
  temp.writeJson('package.json', content);
}

/** Writes the pnpm workspace manifest a `catalog:` specifier is resolved through. */
function writeWorkspaceYaml(temp: TempTree, content: string): void {
  temp.write('pnpm-workspace.yaml', content);
}

// endregion | Helpers
