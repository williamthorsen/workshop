import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { listOwnImplementationSpans, type OwnImplementation } from '../listOwnImplementationSpans.ts';
import type { ProjectSource } from '../readTrackedSources.ts';

const EXPORT_NAMES = ['describeError'];
const PACKAGE_NAME = '@scope/errors';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-own-impl-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(listOwnImplementationSpans, () => {
  describe('in a monorepo', () => {
    it('exempts the lines of a declaration exported under a recommended name', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const text = 'export function describeError(error: unknown) {\n  return String(error);\n}\n';
      const own = buildOwnImplementation([{ path, text }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([
        { endLine: 3, name: 'describeError', startLine: 1 },
      ]);
    });

    it.for([
      ['const', 'export const describeError = (error: unknown) => {};'],
      ['let', 'export let describeError = (error: unknown) => {};'],
      ['var', 'export var describeError = (error: unknown) => {};'],
      ['class', 'export class describeError {}'],
      ['async function', 'export async function describeError(error: unknown) {}'],
      ['generator function', 'export function* describeError(error: unknown) {}'],
      ['default function', 'export default function describeError(error: unknown) {}'],
    ] as const)('exempts the export declared as an exported %s', ([, text], { temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const own = buildOwnImplementation([{ path, text }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([
        { endLine: 1, name: 'describeError', startLine: 1 },
      ]);
    });

    it('exempts the local binding a file renames to a recommended export', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const text = 'function toMessage(error: unknown) {}\nexport { toMessage as describeError };\n';
      const own = buildOwnImplementation([{ path, text }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([{ endLine: 1, name: 'toMessage', startLine: 1 }]);
    });

    it('exempts a separately declared binding exported under its own name', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const text = 'function describeError(error: unknown) {}\nexport { describeError };\n';
      const own = buildOwnImplementation([{ path, text }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([
        { endLine: 1, name: 'describeError', startLine: 1 },
      ]);
    });

    it('exempts no other top-level declaration of the defining file', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const text = [
        'const PREFIX = 1;',
        'export function describeError(error: unknown) {',
        '  return PREFIX + String(error);',
        '}',
        'export function formatError(error: unknown) {',
        '  return String(error);',
        '}',
        '',
      ].join('\n');
      const own = buildOwnImplementation([{ path, text }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([
        { endLine: 4, name: 'describeError', startLine: 2 },
      ]);
    });

    it('exempts a clause whose next statement begins with a from-prefixed identifier', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const text = [
        'function describeError(error: unknown) {}',
        'export { describeError }',
        'fromEntries(pairs);',
        '',
      ].join('\n');
      const own = buildOwnImplementation([{ path, text }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([
        { endLine: 1, name: 'describeError', startLine: 1 },
      ]);
    });

    it('exempts no span in a barrel that re-exports the name from another file', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/index.ts';
      const own = buildOwnImplementation([{ path, text: "export { describeError } from './describeError.ts';\n" }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([]);
    });

    it('exempts no span in a file that declares the name without exporting it', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/format.ts';
      const own = buildOwnImplementation([{ path, text: 'function describeError(error: unknown) {}\n' }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([]);
    });

    it('exempts no span in a file exporting the name under a different one', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/format.ts';
      const text = 'function describeError(error: unknown) {}\nexport { describeError as toMessage };\n';
      const own = buildOwnImplementation([{ path, text }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([]);
    });

    it('exempts no span in a file that only imports and calls the export', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/report.ts';
      const text = "import { describeError } from '@scope/errors';\nconst message = describeError(error);\n";
      const own = buildOwnImplementation([{ path, text }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([]);
    });

    it('exempts no span for a declaration that appears only in a comment', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/report.ts';
      const own = buildOwnImplementation([{ path, text: '// export function describeError(error: unknown) {}\n' }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([]);
    });

    it('exempts no span in a defining file outside the publishing workspace', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/app/src/describeError.ts';
      const own = buildOwnImplementation([{ path, text: 'export function describeError(error: unknown) {}' }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([]);
    });

    it('exempts no span when no workspace has the declared name', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const sources = [{ path, text: 'export function describeError(error: unknown) {}' }];
      const own = { ...buildOwnImplementation(sources), packageName: '@scope/absent' };

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([]);
    });

    it('exempts no span for a path the sweep never read', ({ temp }) => {
      writeMonorepo(temp);
      const own = buildOwnImplementation([]);

      expect(listOwnImplementationSpans('packages/errors/src/describeError.ts', own)).toStrictEqual([]);
    });

    it('exempts no span when the check names no exports', ({ temp }) => {
      writeMonorepo(temp);
      const path = 'packages/errors/src/describeError.ts';
      const sources = [{ path, text: 'export function describeError(error: unknown) {}' }];
      const own = { ...buildOwnImplementation(sources), exportNames: [] };

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([]);
    });
  });

  describe('in a monorepo whose root manifest publishes the package', () => {
    it('exempts a defining declaration in any workspace, the root being the whole repo', ({ temp }) => {
      writeMonorepoPublishingFromRoot(temp);
      const path = 'packages/app/src/describeError.ts';
      const own = buildOwnImplementation([{ path, text: 'export function describeError(error: unknown) {}' }]);

      expect(listOwnImplementationSpans(path, own)).toStrictEqual([
        { endLine: 1, name: 'describeError', startLine: 1 },
      ]);
    });
  });

  describe('in a single-package repo', () => {
    it('exempts the defining declaration alone, not the repo', ({ temp }) => {
      writeSinglePackage(temp);
      const sources = [
        { path: 'src/describeError.ts', text: 'export function describeError(error: unknown) {}' },
        { path: 'src/report.ts', text: 'const message = describeError(error);\n' },
      ];
      const own = buildOwnImplementation(sources);

      expect(listOwnImplementationSpans('src/describeError.ts', own)).toStrictEqual([
        { endLine: 1, name: 'describeError', startLine: 1 },
      ]);
      expect(listOwnImplementationSpans('src/report.ts', own)).toStrictEqual([]);
    });
  });

  it('exempts no span in a repo whose workspaces cannot be discovered', () => {
    const path = 'src/describeError.ts';
    const own = buildOwnImplementation([{ path, text: 'export function describeError(error: unknown) {}' }]);

    expect(listOwnImplementationSpans(path, own)).toStrictEqual([]);
  });
});

// region | Helpers

/** Builds the declaration a check hands the rule, over the sources the case supplies. */
function buildOwnImplementation(sources: readonly ProjectSource[]): OwnImplementation {
  return { exportNames: EXPORT_NAMES, packageName: PACKAGE_NAME, sources };
}

/** Writes a monorepo with two member packages, of which `packages/errors` publishes the package under test. */
function writeMonorepo(temp: TempTree): void {
  temp.writeJson('package.json', { name: 'root', private: true });
  temp.write('pnpm-workspace.yaml', ['packages:', '  - packages/*', ''].join('\n'));
  temp.writeJson('packages/errors/package.json', { name: PACKAGE_NAME, version: '1.0.0' });
  temp.writeJson('packages/app/package.json', { name: '@scope/app', version: '1.0.0' });
}

/** Writes a monorepo whose root manifest publishes the package under test, alongside a member that does not. */
function writeMonorepoPublishingFromRoot(temp: TempTree): void {
  temp.writeJson('package.json', { name: PACKAGE_NAME, version: '1.0.0' });
  temp.write('pnpm-workspace.yaml', ['packages:', '  - packages/*', ''].join('\n'));
  temp.writeJson('packages/app/package.json', { name: '@scope/app', version: '1.0.0' });
}

/** Writes a repo whose single workspace is the root, publishing the package under test. */
function writeSinglePackage(temp: TempTree): void {
  temp.writeJson('package.json', { name: PACKAGE_NAME, version: '1.0.0' });
}

// endregion | Helpers
