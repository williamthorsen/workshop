import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { listWorkspacePackages, ManifestReadError } from '../listWorkspacePackages.ts';

const WORKSPACE_MANIFEST = "packages:\n  - 'packages/*'\n  - 'tools/*'\n  - '!packages/legacy'\n";

describe(listWorkspacePackages, () => {
  it('lists every matched package, sorted by directory, and leaves out the root and excluded packages', () => {
    using tree = createTempTree({
      'package.json': serializeManifest({ name: 'root', private: true }),
      'pnpm-workspace.yaml': WORKSPACE_MANIFEST,
      'packages/beta/package.json': serializeManifest({
        name: '@scope/beta',
        version: '1.2.3',
        description: 'The beta',
      }),
      'packages/alpha/package.json': serializeManifest({ name: '@scope/alpha', version: '0.1.0', private: true }),
      'packages/legacy/package.json': serializeManifest({ name: '@scope/legacy' }),
      'tools/gamma/package.json': serializeManifest({ name: 'gamma', private: 'yes' }),
    });

    const listing = listWorkspacePackages(tree.resolve('packages/beta'));

    expect(listing).toStrictEqual({
      kind: 'packages',
      root: expect.any(String),
      packages: [
        { name: '@scope/alpha', version: '0.1.0', private: true, directory: 'packages/alpha', description: null },
        {
          name: '@scope/beta',
          version: '1.2.3',
          private: false,
          directory: 'packages/beta',
          description: 'The beta',
        },
        { name: 'gamma', version: null, private: false, directory: 'tools/gamma', description: null },
      ],
    });
  });

  it('reports a directory outside any pnpm workspace', () => {
    using tree = createTempTree({ 'package.json': serializeManifest({ name: 'standalone' }) });

    expect(listWorkspacePackages(tree.dir)).toStrictEqual({ kind: 'not-a-workspace' });
  });

  it('reports an empty workspace with its cause', () => {
    using tree = createTempTree({ 'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n" });

    expect(listWorkspacePackages(tree.dir)).toStrictEqual({
      kind: 'empty',
      root: expect.any(String),
      cause: 'no-package',
      patterns: ['packages/*'],
    });
  });

  it.each([
    ['does not parse', '{ not json', /could not read .*packages\/broken\/package\.json: /],
    [
      'is not a JSON object',
      '[]',
      /could not read .*packages\/broken\/package\.json: the manifest is not a JSON object$/,
    ],
  ])('throws a ManifestReadError naming a manifest that %s', (_condition, content, message) => {
    using tree = createTempTree({
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
      'packages/broken/package.json': content,
    });

    expect(() => listWorkspacePackages(tree.dir)).toThrow(message);
    expect(() => listWorkspacePackages(tree.dir)).toThrow(ManifestReadError);
  });
});

// region | Helpers

/** Serializes a manifest as a package's `package.json` content. */
function serializeManifest(fields: Record<string, unknown>): string {
  return `${JSON.stringify(fields, null, 2)}\n`;
}

// endregion | Helpers
