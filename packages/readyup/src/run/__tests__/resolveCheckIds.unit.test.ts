import { describe, expect, it } from 'vitest';

import type { KitProvenance, RepositoryProvenance } from '../../kits/KitProvenance.ts';
import { resolveCheckIds } from '../resolveCheckIds.ts';

describe(resolveCheckIds, () => {
  describe('given a kit published by a package', () => {
    it('namespaces a scoped package under its name with the scope stripped', () => {
      const ids = resolveCheckIds('no-instanceof-error', buildPackageProvenance('@williamthorsen/toolbelt.errors'));

      expect(ids).toStrictEqual({
        accepted: ['toolbelt.errors/no-instanceof-error', '@williamthorsen/toolbelt.errors/no-instanceof-error'],
        bare: 'no-instanceof-error',
        printed: 'toolbelt.errors/no-instanceof-error',
      });
    });

    it('accepts one form for an unscoped package, whose two forms coincide', () => {
      const ids = resolveCheckIds('no-instanceof-error', buildPackageProvenance('readyup'));

      expect(ids).toStrictEqual({
        accepted: ['readyup/no-instanceof-error'],
        bare: 'no-instanceof-error',
        printed: 'readyup/no-instanceof-error',
      });
    });

    it('does not accept the bare id', () => {
      const ids = resolveCheckIds('no-instanceof-error', buildPackageProvenance('@williamthorsen/toolbelt.errors'));

      expect(ids?.accepted).not.toContain('no-instanceof-error');
    });
  });

  describe('given a kit fetched from a repository', () => {
    it('namespaces it under owner and repository, accepting only that form', () => {
      const ids = resolveCheckIds('no-instanceof-error', buildGitHubProvenance('acme', '.github'));

      expect(ids).toStrictEqual({
        accepted: ['acme/.github/no-instanceof-error'],
        bare: 'no-instanceof-error',
        printed: 'acme/.github/no-instanceof-error',
      });
    });

    it('leaves the ref out of the namespace', () => {
      const ids = resolveCheckIds('no-instanceof-error', { ...buildGitHubProvenance('acme', 'standards'), ref: 'v2' });

      expect(ids?.printed).toBe('acme/standards/no-instanceof-error');
    });
  });

  describe('given a kit with no publishing package or repository', () => {
    it('keeps the bare id for a directory kit', () => {
      const ids = resolveCheckIds('no-instanceof-error', { kind: 'directory', label: '.readyup/kits' });

      expect(ids).toStrictEqual({
        accepted: ['no-instanceof-error'],
        bare: 'no-instanceof-error',
        printed: 'no-instanceof-error',
      });
    });

    it('keeps the bare id for a remote kit', () => {
      const ids = resolveCheckIds('no-instanceof-error', { kind: 'remote', label: 'github:org/repo@main' });

      expect(ids).toStrictEqual({
        accepted: ['no-instanceof-error'],
        bare: 'no-instanceof-error',
        printed: 'no-instanceof-error',
      });
    });

    it('keeps the bare id when the kit has no provenance', () => {
      const ids = resolveCheckIds('no-instanceof-error', undefined);

      expect(ids).toStrictEqual({
        accepted: ['no-instanceof-error'],
        bare: 'no-instanceof-error',
        printed: 'no-instanceof-error',
      });
    });
  });

  it('resolves to undefined for a check declaring no id', () => {
    expect(resolveCheckIds(undefined, buildPackageProvenance('@williamthorsen/toolbelt.errors'))).toBeUndefined();
  });
});

// region | Helpers

/** Returns the provenance of a kit fetched from the named GitHub repository at `main`. */
function buildGitHubProvenance(owner: string, repo: string): RepositoryProvenance {
  return { kind: 'repository', host: 'github', owner, repo, ref: 'main', source: `github:${owner}/${repo}` };
}

/** Returns the provenance of a kit published by the named package. */
function buildPackageProvenance(packageName: string): KitProvenance {
  return { kind: 'package', packageName, version: '1.0.0', source: `npm:${packageName}` };
}

// endregion | Helpers
