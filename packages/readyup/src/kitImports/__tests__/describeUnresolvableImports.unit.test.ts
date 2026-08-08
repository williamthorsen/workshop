import { describe, expect, it } from 'vitest';

import { VERSION } from '../../version.ts';
import { describeUnresolvableImports } from '../describeUnresolvableImports.ts';
import type { UnresolvableImports } from '../UnresolvableKitImportsError.ts';

const MISSING_ONE: UnresolvableImports = {
  unknownSubpaths: [],
  missing: [{ specifier: 'readyup/check-utils', names: ['fileExists', 'runGit'] }],
};

describe(describeUnresolvableImports, () => {
  it('names the kit and every missing symbol under its specifier', () => {
    const { message } = describeUnresolvableImports(MISSING_ONE, { kitName: 'drift' });

    expect(message).toBe(
      `kit "drift" cannot run against readyup ${VERSION}: readyup/check-utils does not export fileExists, runGit.`,
    );
  });

  it('names the publishing package where the kit has one', () => {
    const { message } = describeUnresolvableImports(MISSING_ONE, {
      kitName: 'drift',
      provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0' },
    });

    expect(message).toContain('kit "drift" from @acme/kits cannot run against');
  });

  it('reports an unknown subpath alongside missing symbols', () => {
    const findings: UnresolvableImports = {
      unknownSubpaths: ['readyup/legacy'],
      missing: [{ specifier: 'readyup', names: ['legacyHelper'] }],
    };

    const { message } = describeUnresolvableImports(findings, { kitName: 'default' });

    expect(message).toContain('readyup does not export legacyHelper; readyup/legacy is not a subpath it publishes.');
  });

  it('advises recompiling a kit the project owns', () => {
    const { hint } = describeUnresolvableImports(MISSING_ONE, { kitName: 'default' });

    expect(hint).toBe(`Run 'rdy compile' to rebuild it against readyup ${VERSION}.`);
  });

  it('advises upgrading the package that publishes a bundled kit', () => {
    const { hint } = describeUnresolvableImports(MISSING_ONE, {
      kitName: 'default',
      provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0' },
    });

    expect(hint).toBe(`Upgrade @acme/kits to a release compiled against readyup ${VERSION}.`);
  });

  it('advises asking the publisher of a remote kit to recompile', () => {
    const { hint } = describeUnresolvableImports(MISSING_ONE, {
      kitName: 'default',
      provenance: { kind: 'remote', label: 'github:acme/kits@main' },
    });

    expect(hint).toBe(`Ask the publisher of github:acme/kits@main to recompile it against readyup ${VERSION}.`);
  });

  it('advises recompiling in the project owning a kit reached by directory', () => {
    const { hint } = describeUnresolvableImports(MISSING_ONE, {
      kitName: 'default',
      provenance: { kind: 'directory', label: '../sibling/.readyup/kits' },
    });

    expect(hint).toBe("Run 'rdy compile' in the project that owns ../sibling/.readyup/kits.");
  });
});
