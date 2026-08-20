import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import { definesOwnImplementation, type OwnImplementation } from '../definesOwnImplementation.ts';
import type { ProjectSource } from '../readTrackedSources.ts';

const EXPORT_NAMES = ['describeError'];
const PACKAGE_NAME = '@scope/errors';

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-own-impl-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(definesOwnImplementation, () => {
  describe('in a monorepo', () => {
    it('exempts a file in the publishing workspace that declares a recommended export', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const own = buildOwnImplementation([{ path, text: 'export function describeError(error: unknown) {}' }]);

      expect(definesOwnImplementation(path, own)).toBe(true);
    });

    it.for([
      ['const', 'export const describeError = (error: unknown) => {};'],
      ['let', 'export let describeError = (error: unknown) => {};'],
      ['var', 'export var describeError = (error: unknown) => {};'],
      ['class', 'export class describeError {}'],
      ['async function', 'export async function describeError(error: unknown) {}'],
      ['generator function', 'export function* describeError(error: unknown) {}'],
      ['default function', 'export default function describeError(error: unknown) {}'],
    ] as const)('exempts a file declaring the export as an exported %s', ([, text], { temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const own = buildOwnImplementation([{ path, text }]);

      expect(definesOwnImplementation(path, own)).toBe(true);
    });

    it('exempts a file that renames a local binding to a recommended export', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const text = 'function toMessage(error: unknown) {}\nexport { toMessage as describeError };\n';
      const own = buildOwnImplementation([{ path, text }]);

      expect(definesOwnImplementation(path, own)).toBe(true);
    });

    it('exempts a file that exports a separately declared binding under its own name', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const text = 'function describeError(error: unknown) {}\nexport { describeError };\n';
      const own = buildOwnImplementation([{ path, text }]);

      expect(definesOwnImplementation(path, own)).toBe(true);
    });

    it('reports a file in the publishing workspace that declares the name without exporting it', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/format.ts';
      const own = buildOwnImplementation([{ path, text: 'function describeError(error: unknown) {}\n' }]);

      expect(definesOwnImplementation(path, own)).toBe(false);
    });

    it('reports a file exporting the name under a different one', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/format.ts';
      const text = 'function describeError(error: unknown) {}\nexport { describeError as toMessage };\n';
      const own = buildOwnImplementation([{ path, text }]);

      expect(definesOwnImplementation(path, own)).toBe(false);
    });

    it('reports a file in the publishing workspace that only imports and calls the export', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/report.ts';
      const text = "import { describeError } from '@scope/errors';\nconst message = describeError(error);\n";
      const own = buildOwnImplementation([{ path, text }]);

      expect(definesOwnImplementation(path, own)).toBe(false);
    });

    it('reports a declaration that appears only in a comment', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/report.ts';
      const own = buildOwnImplementation([{ path, text: '// function describeError(error: unknown) {}\n' }]);

      expect(definesOwnImplementation(path, own)).toBe(false);
    });

    it('reports a defining file outside the publishing workspace', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/app/src/describeError.ts';
      const own = buildOwnImplementation([{ path, text: 'export function describeError(error: unknown) {}' }]);

      expect(definesOwnImplementation(path, own)).toBe(false);
    });

    it('reports every file when no workspace carries the declared name', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const sources = [{ path, text: 'export function describeError(error: unknown) {}' }];
      const own = { ...buildOwnImplementation(sources), packageName: '@scope/absent' };

      expect(definesOwnImplementation(path, own)).toBe(false);
    });

    it('reports a path the sweep never read', ({ temp }) => {
      writeMonorepo(temp);
      const own = buildOwnImplementation([]);

      expect(definesOwnImplementation('packages/errors/src/describeError.ts', own)).toBe(false);
    });

    it('reports every file when the check names no exports', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const sources = [{ path, text: 'export function describeError(error: unknown) {}' }];
      const own = { ...buildOwnImplementation(sources), exportNames: [] };

      expect(definesOwnImplementation(path, own)).toBe(false);
    });
  });

  describe('in a single-package repo', () => {
    it('exempts the defining file alone, not the repo', ({ temp }) => {
      writeSinglePackage(temp);
      const sources = [
        { path: 'src/describeError.ts', text: 'export function describeError(error: unknown) {}' },
        { path: 'src/report.ts', text: 'const message = describeError(error);\n' },
      ];
      const own = buildOwnImplementation(sources);

      expect(definesOwnImplementation('src/describeError.ts', own)).toBe(true);
      expect(definesOwnImplementation('src/report.ts', own)).toBe(false);
    });
  });

  it('reports every file in a repo whose workspaces cannot be discovered', () => {
    const path = 'src/describeError.ts';
    const own = buildOwnImplementation([{ path, text: 'export function describeError(error: unknown) {}' }]);

    expect(definesOwnImplementation(path, own)).toBe(false);
  });
});

// region | Helpers

/** Builds the declaration a check hands the rule, over the sources the case supplies. */
function buildOwnImplementation(sources: readonly ProjectSource[]): OwnImplementation {
  return { exportNames: EXPORT_NAMES, packageName: PACKAGE_NAME, sources };
}

/** Writes a two-workspace repo in which `packages/errors` publishes the package under test. */
function writeMonorepo(temp: TempTree): void {
  temp.writeJson('package.json', { name: 'root', private: true });
  temp.write('pnpm-workspace.yaml', ['packages:', '  - packages/*', ''].join('\n'));
  temp.writeJson('packages/errors/package.json', { name: PACKAGE_NAME, version: '1.0.0' });
  temp.writeJson('packages/app/package.json', { name: '@scope/app', version: '1.0.0' });
}

/** Writes a repo whose single workspace is the root, publishing the package under test. */
function writeSinglePackage(temp: TempTree): void {
  temp.writeJson('package.json', { name: PACKAGE_NAME, version: '1.0.0' });
}

// endregion | Helpers
