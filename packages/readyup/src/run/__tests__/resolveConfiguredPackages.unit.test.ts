import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { captureRdyError } from '../../test-utils/captureRdyError.ts';
import { useTempDir } from '../../test-utils/tempDir.ts';
import { resolveConfiguredPackages } from '../resolveConfiguredPackages.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';

describe(resolveConfiguredPackages, () => {
  const project = useTempDir({ prefix: 'resolve-configured-packages-', cwd: 'chdir' });

  it('expands a configured package into an entry per requested kit', () => {
    installPackage('@acme/kits', ['default'], '2.1.0');

    expect(resolveConfiguredPackages(['@acme/kits'], ['default'], '.js')).toStrictEqual([
      {
        name: 'default',
        source: { path: path.join(project.dir, 'node_modules', '@acme/kits', '.readyup', 'kits', 'default.js') },
        checklists: [],
        provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0' },
      },
    ]);
  });

  it('orders the entries name-major across the configured packages', () => {
    installPackage('@acme/kits', ['default', 'preflight']);
    installPackage('@beta/kits', ['default', 'preflight']);

    const entries = resolveConfiguredPackages(['@acme/kits', '@beta/kits'], ['preflight', 'default'], '.js');

    expect(entries.map(describeEntry)).toStrictEqual([
      '@acme/kits:preflight',
      '@beta/kits:preflight',
      '@acme/kits:default',
      '@beta/kits:default',
    ]);
  });

  // Requiring nothing under a name is a package with nothing to answer for, not a failure of the run.
  it('skips a configured package that publishes no requested kit', () => {
    installPackage('@acme/kits', ['default', 'preflight']);
    installPackage('@beta/kits', ['default']);

    const entries = resolveConfiguredPackages(['@acme/kits', '@beta/kits'], ['preflight'], '.js');

    expect(entries.map(describeEntry)).toStrictEqual(['@acme/kits:preflight']);
  });

  // A bare `--packages` fills the name in, so no package publishing it is the "requires nothing" case.
  it('resolves to nothing when no configured package publishes the default kit', () => {
    installPackage('@acme/kits', ['preflight']);

    expect(resolveConfiguredPackages(['@acme/kits'], ['default'], '.js')).toStrictEqual([]);
  });

  it('rejects a named kit no configured package publishes', async () => {
    installPackage('@acme/kits', ['default', 'preflight']);

    const error = await captureRdyError(() => {
      resolveConfiguredPackages(['@acme/kits'], ['absent'], '.js');
      return 0;
    });

    expect(error.code).toBe('usage');
    expect(error.message).toBe(
      'No configured package publishes a kit named "absent"; available kits: default, preflight.',
    );
  });

  it('rejects an empty configured-packages list, which no config declared', async () => {
    const error = await captureRdyError(() => {
      resolveConfiguredPackages([], ['default'], '.js');
      return 0;
    });

    expect(error.code).toBe('usage');
    expect(error.message).toMatch(/requires a "packages" list/);
  });

  it('applies the extension it is given to every kit path', () => {
    installPackage('@acme/kits', ['default']);

    expect(resolveConfiguredPackages(['@acme/kits'], ['default'], '.ts')).toStrictEqual([
      {
        name: 'default',
        source: { path: path.join(project.dir, 'node_modules', '@acme/kits', '.readyup', 'kits', 'default.ts') },
        checklists: [],
        provenance: { kind: 'package', packageName: '@acme/kits', version: undefined },
      },
    ]);
  });

  // region | Helpers

  /** Names a run entry as the package it came from and the kit it runs, which is what an order assertion reads. */
  function describeEntry(entry: ResolvedKitEntry): string {
    const packageName = entry.provenance?.kind === 'package' ? entry.provenance.packageName : entry.provenance?.kind;
    return `${packageName}:${entry.name}`;
  }

  /**
   * Installs a package declaring the named kits in its manifest.
   *
   * The kit files themselves are left unwritten: this resolver names where a kit would be read from and
   * never opens it, so a fixture that wrote them would prove nothing the manifest does not already say.
   */
  function installPackage(name: string, kits: string[], version?: string): void {
    const root = path.join('node_modules', name);
    project.writeJson(path.join(root, 'package.json'), { name, ...(version !== undefined && { version }) });
    project.writeJson(path.join(root, '.readyup', 'manifest.json'), {
      version: 1,
      kits: kits.map((kit) => ({ name: kit })),
    });
  }

  // endregion | Helpers
});
