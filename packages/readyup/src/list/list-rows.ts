import { getLayout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';
import type { RdyManifestChecklistChecks } from '../manifest/manifestSchema.ts';
import type { SourceGroup } from '../sources/collectSourceGroups.ts';
import type { SourceKit } from '../sources/expandConfiguredSources.ts';

/** Blank line separating one listed section from the next. A section supplies none of its own. */
export const SECTION_SEPARATOR = '\n\n';

/** Detail marking a package that the readyup config's `sources` list does not name. */
export const UNCONFIGURED_DETAIL = 'not listed in the readyup config';

/** The detail appended to a kit whose manifest records its checklists without their check names. */
const UNRECORDED_CHECKS_DETAIL = '(checks not recorded; recompile to record them)';

/** One listed kit, with the description and checklist names that its manifest records. */
export interface KitView {
  name: string;
  description?: string | undefined;
  checklists?: readonly string[] | undefined;
  checklistChecks?: readonly RdyManifestChecklistChecks[] | undefined;
}

/**
 * Returns the kit placeholder with the checklist filter that may follow it, bracketed when `kits` contains a default.
 *
 * The bracket wraps the filter too, because a filter needs a kit name before it.
 */
export function buildKitSelectionHint(kits: readonly string[]): string {
  return bracketIfDefault('<kit>[:<checklist>,...]', kits);
}

/**
 * Returns the indented line naming the command that runs the kits beneath it.
 *
 * The label separates the line from the kit rows sharing its column: The role glyphs shown by those rows
 * are empty in plain style, so without it the command looks like one more kit row.
 */
export function buildRunLine(command: string, depth = 1): string {
  return `${getLayout().indent(depth)}To run: ${command}`;
}

/**
 * Returns the command that runs a source's kits, which also marks the source as configured.
 *
 * `rdy run --sources` includes only the sources named by the config, and every other package is reachable
 * by the `--from` source naming it directly. So one hint covers both what to run and whether a `--sources` run
 * would include it, and every kit listed stays reachable by the command above it.
 */
export function buildSourceHint(group: SourceGroup): string {
  const kitNames = group.kits.map((kit) => kit.kitName);
  return group.configured
    ? `rdy run --sources ${buildKitHint(kitNames)}`
    : `rdy run --from ${group.source} ${buildKitSelectionHint(kitNames)}`;
}

/** Returns a package's name with the version that its own manifest records, if it records one, or a repository's spelling. */
export function buildSourceLabel(group: SourceGroup): string {
  return group.version === undefined ? group.name : `${group.name}@${group.version}`;
}

/**
 * Returns a kit's line, then a line one level deeper for each checklist that its manifest records.
 *
 * The checklists keep the manifest's order, which is the order in which the kit declares and runs them. With
 * `shouldShowChecks`, each checklist is followed by its check names one level deeper still, matched to it by
 * position, and a kit whose manifest records checklists without check names says so in its line's detail.
 */
export function formatKitRows(
  kit: KitView,
  token: TokenName,
  { depth = 0, shouldShowChecks = false }: { depth?: number; shouldShowChecks?: boolean } = {},
): string[] {
  const checklists = kit.checklists ?? [];
  const isUnrecorded = shouldShowChecks && checklists.length > 0 && kit.checklistChecks === undefined;
  const detail = [kit.description, isUnrecorded ? UNRECORDED_CHECKS_DETAIL : undefined]
    .filter((part) => part !== undefined)
    .join(' ');
  const kitLine = getLayout().formatCheckLine({ token, name: kit.name, depth, ...(detail !== '' && { detail }) });
  const checklistLines = checklists.flatMap((name, index) => [
    getLayout().formatCheckLine({ token: 'checklist', name, depth: depth + 1 }),
    ...(shouldShowChecks ? (kit.checklistChecks?.[index]?.checks ?? []) : []).map((checkName) =>
      getLayout().formatCheckLine({ token: 'check', name: checkName, depth: depth + 2 }),
    ),
  ]);

  return [kitLine, ...checklistLines];
}

/**
 * Returns the glyph token that heads a source of the given kind: a package's, or a remote location's for a repository.
 */
export function resolveSourceToken(kind: SourceGroup['kind']): 'sourcePackage' | 'sourceRemote' {
  return kind === 'repository' ? 'sourceRemote' : 'sourcePackage';
}

/** Returns the row that a source's kit is listed as, named by the kit alone. */
export function toKitView(kit: SourceKit): KitView {
  return {
    name: kit.kitName,
    description: kit.description,
    checklists: kit.checklists,
    checklistChecks: kit.checklistChecks,
  };
}

// region | Helpers

/** Returns `hint` wrapped in brackets when `kits` contains a default, which a run naming no kit selects. */
function bracketIfDefault(hint: string, kits: readonly string[]): string {
  return kits.includes('default') ? `[${hint}]` : hint;
}

/**
 * Returns the kit placeholder for a source that selects kits by name alone, bracketed when `kits` contains a default.
 *
 * `--sources` is that source: It rejects a checklist filter, since the kit that it names may be published by
 * several configured sources.
 */
function buildKitHint(kits: readonly string[]): string {
  return bracketIfDefault('<kit>', kits);
}

// endregion | Helpers
