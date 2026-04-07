import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import {
  hasDevDependency,
  hasMinDevDependencyVersion,
  hasPackageJsonField,
  readPackageJson,
} from '../../src/check-utils/package-json.ts';

let tempDir: string;
let cwdSpy: MockInstance;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'rdy-pkg-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  cwdSpy.mockRestore();
});

function writePackageJson(content: Record<string, unknown>): void {
  writeFileSync(join(tempDir, 'package.json'), JSON.stringify(content));
}

describe(readPackageJson, () => {
  it('returns the parsed package.json', () => {
    writePackageJson({ name: 'test-pkg', version: '1.0.0' });

    const result = readPackageJson();

    expect(result).toEqual({ name: 'test-pkg', version: '1.0.0' });
  });

  it('returns undefined when package.json does not exist', () => {
    expect(readPackageJson()).toBeUndefined();
  });

  it('returns undefined when package.json is not an object', () => {
    writeFileSync(join(tempDir, 'package.json'), '"not an object"');

    expect(readPackageJson()).toBeUndefined();
  });
});

describe(hasPackageJsonField, () => {
  it('returns true when the field exists', () => {
    writePackageJson({ type: 'module' });

    expect(hasPackageJsonField('type')).toBe(true);
  });

  it('returns false when the field does not exist', () => {
    writePackageJson({});

    expect(hasPackageJsonField('type')).toBe(false);
  });

  it('returns true when the field matches the expected value', () => {
    writePackageJson({ type: 'module' });

    expect(hasPackageJsonField('type', 'module')).toBe(true);
  });

  it('returns false when the field does not match the expected value', () => {
    writePackageJson({ type: 'commonjs' });

    expect(hasPackageJsonField('type', 'module')).toBe(false);
  });

  it('returns false when package.json does not exist', () => {
    expect(hasPackageJsonField('type')).toBe(false);
  });
});

describe(hasDevDependency, () => {
  it('returns true when the dependency is present', () => {
    writePackageJson({ devDependencies: { vitest: '^1.0.0' } });

    expect(hasDevDependency('vitest')).toBe(true);
  });

  it('returns false when the dependency is absent', () => {
    writePackageJson({ devDependencies: {} });

    expect(hasDevDependency('vitest')).toBe(false);
  });

  it('returns false when devDependencies is missing', () => {
    writePackageJson({});

    expect(hasDevDependency('vitest')).toBe(false);
  });
});

describe(hasMinDevDependencyVersion, () => {
  it('returns true when the version meets the minimum', () => {
    writePackageJson({ devDependencies: { vitest: '^2.0.0' } });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(true);
  });

  it('returns false when the version is below the minimum', () => {
    writePackageJson({ devDependencies: { vitest: '^0.34.0' } });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(false);
  });

  it('returns false when the dependency is not present', () => {
    writePackageJson({ devDependencies: {} });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(false);
  });

  it('returns true when the exempt predicate matches', () => {
    writePackageJson({ devDependencies: { core: 'workspace:*' } });

    expect(
      hasMinDevDependencyVersion('core', '1.0.0', {
        exempt: (range) => range.startsWith('workspace:'),
      }),
    ).toBe(true);
  });

  it('returns false when the version range has no extractable version', () => {
    writePackageJson({ devDependencies: { vitest: 'latest' } });

    expect(hasMinDevDependencyVersion('vitest', '1.0.0')).toBe(false);
  });
});
