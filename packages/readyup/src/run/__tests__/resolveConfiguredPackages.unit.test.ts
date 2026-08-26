import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureError, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import { RdyError } from '../../errors/RdyError.ts';
import { resolveConfiguredPackages } from '../resolveConfiguredPackages.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'resolve-configured-packages-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runTest();
});

describe(resolveConfiguredPackages, () => {
  it('expands a configured package into an entry per requested kit', ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default'], '2.1.0');

    expect(resolveConfiguredPackages(['@acme/kits'], ['default'], '.js')).toStrictEqual([
      {
        name: 'default',
        source: { path: path.join(temp.dir, 'node_modules', '@acme/kits', '.readyup', 'kits', 'default.js') },
        checklists: [],
        provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0' },
      },
    ]);
  });

  it('orders the entries name-major across the configured packages', ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default', 'preflight']);
    installPackage(temp, '@beta/kits', ['default', 'preflight']);

    const entries = resolveConfiguredPackages(['@acme/kits', '@beta/kits'], ['preflight', 'default'], '.js');

    expect(entries.map(describeEntry)).toStrictEqual([
      '@acme/kits:preflight',
      '@beta/kits:preflight',
      '@acme/kits:default',
      '@beta/kits:default',
    ]);
  });

  // Requiring nothing under a name is a package with nothing to answer for, not a failure of the run.
  it('skips a configured package that publishes no requested kit', ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default', 'preflight']);
    installPackage(temp, '@beta/kits', ['default']);

    const entries = resolveConfiguredPackages(['@acme/kits', '@beta/kits'], ['preflight'], '.js');

    expect(entries.map(describeEntry)).toStrictEqual(['@acme/kits:preflight']);
  });

  // A bare `--packages` fills the name in, so no package publishing it is the "requires nothing" case.
  it('resolves to an empty list when no configured package publishes the default kit', ({ temp }) => {
    installPackage(temp, '@acme/kits', ['preflight']);

    expect(resolveConfiguredPackages(['@acme/kits'], ['default'], '.js')).toStrictEqual([]);
  });

  // Answering with an empty pass would be the clean report of nothing checked.
  it('rejects a named kit no configured package publishes', async ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default', 'preflight']);

    const error = await captureError(RdyError, () => {
      resolveConfiguredPackages(['@acme/kits'], ['absent'], '.js');
      return 0;
    });

    expect(error.code).toBe('usage');
    expect(error.message).toBe(
      'No configured package publishes a kit named "absent"; available kits: default, preflight.',
    );
  });

  it('rejects an empty configured-packages list, which no config declared', async () => {
    const error = await captureError(RdyError, () => {
      resolveConfiguredPackages([], ['default'], '.js');
      return 0;
    });

    expect(error.code).toBe('usage');
    expect(error.message).toMatch(/requires a "packages" list/);
  });

  it('applies the extension it is given to every kit path', ({ temp }) => {
    installPackage(temp, '@acme/kits', ['default']);

    expect(resolveConfiguredPackages(['@acme/kits'], ['default'], '.ts')).toStrictEqual([
      {
        name: 'default',
        source: { path: path.join(temp.dir, 'node_modules', '@acme/kits', '.readyup', 'kits', 'default.ts') },
        checklists: [],
        provenance: { kind: 'package', packageName: '@acme/kits', version: undefined },
      },
    ]);
  });
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
function installPackage(temp: TempTree, name: string, kits: string[], version?: string): void {
  const root = path.join('node_modules', name);
  temp.writeJson(path.join(root, 'package.json'), { name, ...(version !== undefined && { version }) });
  temp.writeJson(path.join(root, '.readyup', 'manifest.json'), {
    version: 1,
    kits: kits.map((kit) => ({ name: kit })),
  });
}

// endregion | Helpers
