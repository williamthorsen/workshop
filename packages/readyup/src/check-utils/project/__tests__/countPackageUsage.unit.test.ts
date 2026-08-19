import { describe, expect, it } from 'vitest';

import { countPackageUsage } from '../countPackageUsage.ts';
import type { ProjectSource } from '../readTrackedSources.ts';

const PACKAGE_NAME = '@williamthorsen/toolbelt.errors';
const EXPORT_NAMES = ['assertIsError', 'describeError'];

describe(countPackageUsage, () => {
  it('returns zero for a source that defines and calls its own helper of the same name', () => {
    const source = buildSource(`
      function describeError(error) { return String(error); }
      export const first = describeError(new Error('a'));
      export const second = describeError(new Error('b'));
    `);

    expect(count(source)).toBe(0);
  });

  it('counts calls in a source importing the package root', () => {
    const source = buildSource(`
      import { assertIsError, describeError } from '${PACKAGE_NAME}';
      export const described = describeError(error);
      export function guard(error) { assertIsError(error); }
    `);

    expect(count(source)).toBe(2);
  });

  it('counts calls in a source importing a subpath', () => {
    const source = buildSource(`
      import { assertIsError } from '${PACKAGE_NAME}/candidate';
      export function guard(error) { assertIsError(error); }
    `);

    expect(count(source)).toBe(1);
  });

  it('recognizes a require and a dynamic import as imports of the package', () => {
    const required = buildSource(`
      const { describeError } = require('${PACKAGE_NAME}');
      module.exports = describeError(error);
    `);
    const imported = buildSource(`
      const { describeError } = await import('${PACKAGE_NAME}');
      export const described = describeError(error);
    `);

    expect(count(required)).toBe(1);
    expect(count(imported)).toBe(1);
  });

  it('matches a dot in the package name literally', () => {
    const source = buildSource(`
      import { describeError } from '@williamthorsen/toolbeltXerrors';
      export const described = describeError(error);
    `);

    expect(count(source)).toBe(0);
  });

  it('does not count a call written in a line or a block comment', () => {
    const source = buildSource(`
      import { describeError } from '${PACKAGE_NAME}';
      // describeError(error) replaced the hand-rolled version.
      /* and describeError(error) once more. */
      export const described = describeError(error);
    `);

    expect(count(source)).toBe(1);
  });

  it('does not count a call written in a string, a template literal, or a regular expression', () => {
    const source = buildSource(`
      import { describeError } from '${PACKAGE_NAME}';
      export const hint = 'call describeError(error) instead';
      export const label = \`prefer describeError(error)\`;
      export const pattern = /describeError\\(/;
      export const described = describeError(error);
    `);

    expect(count(source)).toBe(1);
  });

  it('counts a call interpolated into a template literal', () => {
    const source = buildSource(`
      import { describeError } from '${PACKAGE_NAME}';
      export const label = \`error: \${describeError(error)}\`;
    `);

    expect(count(source)).toBe(1);
  });

  it('counts no call in a source whose only import of the package is commented out', () => {
    const source = buildSource(`
      // import { describeError } from '${PACKAGE_NAME}';
      function describeError(error) { return String(error); }
      export const described = describeError(error);
    `);

    expect(count(source)).toBe(0);
  });

  it('totals the calls of every importing source', () => {
    const first = buildSource(`import { describeError } from '${PACKAGE_NAME}';\nexport const a = describeError(e);`);
    const second = buildSource(`import { describeError } from '${PACKAGE_NAME}';\nexport const b = describeError(e);`);
    const third = buildSource('export const c = describeError(e);');

    expect(count(first, second, third)).toBe(2);
  });

  it('returns zero when no export names are named', () => {
    const source = buildSource(`import { describeError } from '${PACKAGE_NAME}';\nexport const a = describeError(e);`);

    expect(countPackageUsage([source], { exportNames: [], packageName: PACKAGE_NAME })).toBe(0);
  });
});

// region | Helpers

/** Builds a source holding the given text, at a path this function never reads. */
function buildSource(text: string): ProjectSource {
  return { path: 'src/source.ts', text };
}

/** Counts usage of the package under test across the given sources. */
function count(...sources: ProjectSource[]): number {
  return countPackageUsage(sources, { exportNames: EXPORT_NAMES, packageName: PACKAGE_NAME });
}

// endregion | Helpers
