import type { SourceGroup } from '../../sources/collectSourceGroups.ts';
import type { SourceKit } from '../../sources/expandConfiguredSources.ts';
import type { ProjectSourcesView } from '../formatList.ts';

/**
 * Builds a configured package group containing the named kits, each undescribed.
 *
 * `version` defaults to `2.1.0`, which an explicit `undefined` takes as well: A group naming no version
 * is built inline.
 */
export function buildGroup({
  packageName,
  version = '2.1.0',
  configured = true,
  kits,
}: {
  packageName: string;
  version?: string | undefined;
  configured?: boolean;
  kits: string[];
}): SourceGroup {
  return {
    kind: 'package',
    source: `npm:${packageName}`,
    name: packageName,
    version,
    configured,
    kits: kits.map((kitName) => buildKit(packageName, kitName, undefined)),
  };
}

/** Builds one published kit, whose path the packages view never renders. */
export function buildKit(
  packageName: string,
  kitName: string,
  description: string | undefined,
  checklists?: string[],
): SourceKit {
  return {
    source: `npm:${packageName}`,
    version: '2.1.0',
    kitName,
    description,
    checklists,
    checklistChecks: undefined,
    location: { path: `node_modules/${packageName}/.readyup/kits/${kitName}.js` },
    provenance: { kind: 'package', packageName, version: '2.1.0', source: `npm:${packageName}` },
  };
}

/** Builds one project's contribution to a repo-wide dependency listing. */
export function buildProjectSources({ dir, groups }: { dir: string; groups: SourceGroup[] }): ProjectSourcesView {
  return { dir, groups };
}
