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

  it('returns false for a catalog specifier', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { vitest: 'catalog:' } });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(false);
  });

  it('returns true when the exempt predicate matches', ({ temp }) => {
    writePackageJson(temp, { devDependencies: { core: 'link:../core' } });

    expect(
      hasMinDevDependencyVersion('core', '1.0.0', {
        exempt: (specifier) => specifier.startsWith('link:'),
      }),
    ).toBe(true);
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

// endregion | Helpers
