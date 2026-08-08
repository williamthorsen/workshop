import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isRecord } from '../../isRecord.ts';
import { listRunnerExports, listRunnerSpecifiers } from '../listRunnerExports.ts';

/**
 * The specifiers this package's `exports` map serves as JavaScript.
 *
 * A JSON subpath is excluded: it has no named exports for the table to account for.
 */
function readPublishedSpecifiers(): string[] {
  const packageJsonPath = path.resolve(import.meta.dirname, '../../../package.json');
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (!isRecord(parsed) || !isRecord(parsed['exports'])) throw new Error('package.json declares no exports map');

  return Object.keys(parsed['exports'])
    .filter((subpath) => !subpath.endsWith('.json'))
    .map((subpath) => (subpath === '.' ? 'readyup' : subpath.replace('.', 'readyup')))
    .toSorted();
}

describe(listRunnerSpecifiers, () => {
  it('accounts for every JavaScript subpath the package publishes', () => {
    expect(listRunnerSpecifiers().toSorted()).toStrictEqual(readPublishedSpecifiers());
  });
});

describe(listRunnerExports, () => {
  it('reports the root entry point as exporting its authoring helpers', () => {
    expect(listRunnerExports('readyup')).toContain('defineRdyKit');
    expect(listRunnerExports('readyup')).toContain('DEFAULT_MANIFEST_PATH');
  });

  it('reports the check-utils subpath as exporting its check helpers', () => {
    expect(listRunnerExports('readyup/check-utils')).toContain('fileExists');
    expect(listRunnerExports('readyup/check-utils')).toContain('runGit');
  });

  it('omits a type-only export, which no bundle can bind', () => {
    expect(listRunnerExports('readyup')).not.toContain('RdyKit');
  });

  it('returns undefined for a subpath the package does not publish', () => {
    expect(listRunnerExports('readyup/legacy')).toBeUndefined();
  });
});
