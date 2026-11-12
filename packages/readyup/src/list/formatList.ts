import { getLayout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';
import type { SourceGroup } from '../sources/collectSourceGroups.ts';
import {
  buildKitSelectionHint,
  buildRunLine,
  buildSourceHint,
  buildSourceLabel,
  formatKitRows,
  type KitView,
  resolveSourceToken,
  SECTION_SEPARATOR,
  toKitView,
  UNCONFIGURED_DETAIL,
} from './list-rows.ts';

// -- Owner view --

interface OwnerViewOptions {
  sourceKits?: string[];
  internalKits: string[];
  compiledKits: KitView[];
  configuredKits?: ConfiguredKitView[];
  availableSources?: string[];
  shouldShowChecks?: boolean;
}

/** A kit published by a configured source, headed by the glyph of the kind of source that publishes it. */
export interface ConfiguredKitView extends KitView {
  sourceKind: 'package' | 'repository';
}

/**
 * Returns the owner-mode output, showing the uncompiled, internal, and compiled kit sections.
 *
 * Empty sections are omitted. Returns the empty-owner message when every list is empty.
 *
 * The Uncompiled and Internal sections are separate axes rather than one section under two names:
 * `sourceKits` lists what `compile.include` and `compile.exclude` select, which `rdy run --jit` runs, and
 * `internalKits` lists the bucket that `internal.dir` and `internal.infix` declare, which needs `--internal`
 * as well. A caller whose config declares neither key passes no internal kits, because `--internal` would
 * then resolve every name exactly as plain `--jit` does and its rows would restate the Uncompiled rows above
 * them.
 *
 * Every compiled kit is named rather than pathed, whatever `compile.outDir` is set to, because this view
 * reports the kits of the reader's working directory and `rdy run <kit>` reads that project's own
 * `outDir`. Only the repo-wide view, whose rows belong to other projects, still has to name them by path.
 */
export function formatOwnerView({
  sourceKits = [],
  internalKits,
  compiledKits,
  configuredKits = [],
  availableSources = [],
  shouldShowChecks = false,
}: OwnerViewOptions): string {
  if (
    sourceKits.length === 0 &&
    internalKits.length === 0 &&
    compiledKits.length === 0 &&
    configuredKits.length === 0
  ) {
    // The listing for a project with no kits of its own still shows what its dependencies offer, which is the
    // one next step that an empty listing can give.
    return availableSources.length === 0
      ? formatEmpty('owner')
      : [formatEmpty('owner'), formatAvailableSection(availableSources)].join(SECTION_SEPARATOR);
  }

  const sections: string[] = [];

  if (sourceKits.length > 0) {
    const command = `rdy run --jit ${buildKitSelectionHint(sourceKits)}`;
    const items = sourceKits.map((name) => ({ name }));
    sections.push(formatSection('Uncompiled', buildRunLine(command), items, 'kitSource'));
  }

  if (internalKits.length > 0) {
    const command = `rdy run --jit --internal ${buildKitSelectionHint(internalKits)}`;
    const items = internalKits.map((name) => ({ name }));
    sections.push(formatSection('Internal', buildRunLine(command), items, 'kitSource'));
  }

  if (compiledKits.length > 0) {
    const command = `rdy run ${buildKitSelectionHint(compiledKits.map((kit) => kit.name))}`;
    sections.push(formatSection('Compiled', buildRunLine(command), compiledKits, 'kit', shouldShowChecks));
  }

  if (configuredKits.length > 0) {
    // The rows list every published kit -- discovery is not run selection -- so the bracketed optional name
    // ensures that the command above the rows can run every kit listed.
    const items = configuredKits.flatMap((kit) =>
      formatKitRows(kit, resolveSourceToken(kit.sourceKind), { shouldShowChecks }),
    );
    const heading = getLayout().formatHeading('Configured sources', 'section');
    sections.push([heading, buildRunLine('rdy run --sources [<kit>]'), ...items].join('\n'));
  }

  if (availableSources.length > 0) {
    sections.push(formatAvailableSection(availableSources));
  }

  return sections.join(SECTION_SEPARATOR);
}

// -- Consumer view --

interface ConsumerViewOptions {
  compiledKits: KitView[];
  fromArg: string;
  kitsDir: string;
  shouldShowChecks?: boolean;
}

/**
 * Returns the consumer-mode output, showing the compiled kits at a local path.
 *
 * Returns the empty-consumer message when the kit list is empty.
 */
export function formatConsumerView({
  compiledKits,
  fromArg,
  kitsDir,
  shouldShowChecks = false,
}: ConsumerViewOptions): string {
  if (compiledKits.length === 0) {
    return formatEmpty('consumer', kitsDir);
  }

  const command = `rdy run --from ${fromArg} ${buildKitSelectionHint(compiledKits.map((kit) => kit.name))}`;
  return formatSection('Compiled', buildRunLine(command), compiledKits, 'kit', shouldShowChecks);
}

// -- Sources view --

interface SourcesViewOptions {
  groups: SourceGroup[];
  shouldShowChecks?: boolean;
}

/**
 * Formats the dependency-axis output: one block per kit source, headed by the package or repository.
 *
 * Configured and unconfigured packages interleave in one alphabetical list rather than splitting into
 * sections, so a reader asking what their dependencies publish reads one answer. The hint shown by each
 * block separates them: It names the command that runs that source's kits.
 *
 * A sweep with no groups returns the empty-sources message.
 */
export function formatSourcesView({ groups, shouldShowChecks = false }: SourcesViewOptions): string {
  return groups.length === 0
    ? formatEmpty('sources')
    : groups.map((group) => formatSourceBlock(group, shouldShowChecks)).join(SECTION_SEPARATOR);
}

// -- Empty messages --

/** Returns the "no kits found" message that suits the given mode. */
export function formatEmpty(
  mode: 'owner' | 'consumer' | 'recursive' | 'recursive-sources' | 'sources',
  kitsDir?: string,
): string {
  if (mode === 'consumer') {
    return `No compiled kits found at ${kitsDir ?? '.readyup/kits'}.`;
  }
  if (mode === 'sources') {
    return 'No installed dependency or configured source publishes kits.';
  }
  if (mode === 'recursive') {
    return 'No kit projects found.';
  }
  if (mode === 'recursive-sources') {
    return 'No dependency or configured source of any project below this directory publishes kits.';
  }
  return 'No kits found.\nRun `rdy init` to scaffold an internal kit or `rdy compile` to compile a kit from source.';
}

// -- Manifest view --

interface ManifestViewOptions {
  kits: Array<KitView & { readyupVersion?: string | undefined }>;
  manifestPath: string;
  /** The `--from` value that names the manifest's source; a manifest file read directly has none. */
  fromArg?: string | undefined;
  shouldShowChecks?: boolean;
}

/**
 * Returns a heading naming the manifest, then one line per kit, followed by its checklists.
 *
 * A kit's line shows its version as a parenthetical and its description as inline detail, each present
 * only when the manifest records it. The `readyup` label distinguishes the runner's version from a
 * version that the kit might declare for itself.
 *
 * `fromArg` adds the command that runs the kits beneath the heading. A manifest named by `--manifest` gets
 * none, since `rdy run` cannot take a manifest file as its source.
 */
export function formatManifestView({
  fromArg,
  kits,
  manifestPath,
  shouldShowChecks = false,
}: ManifestViewOptions): string {
  if (kits.length === 0) {
    return `No kits found in manifest: ${manifestPath}`;
  }

  const heading = getLayout().formatHeading(`Manifest: ${manifestPath}`, 'section');
  const hintLines =
    fromArg === undefined
      ? []
      : [buildRunLine(`rdy run --from ${fromArg} ${buildKitSelectionHint(kits.map((kit) => kit.name))}`)];
  const items = kits.flatMap((kit) => {
    const versionSegment = kit.readyupVersion !== undefined ? ` (readyup v${kit.readyupVersion})` : '';
    return formatKitRows({ ...kit, name: `${kit.name}${versionSegment}` }, 'kit', { shouldShowChecks });
  });

  return [heading, ...hintLines, ...items].join('\n');
}

// region | Helpers

/**
 * Returns the section naming installed packages that publish kits not listed in the config.
 *
 * It has no `To run:` label, because its line heads the section with what to do about those packages
 * rather than a command to run. The example names the first candidate alone: An array of every candidate
 * would read as the whole `sources` value, replacing the entries that the config already lists.
 */
function formatAvailableSection(availableSources: string[]): string {
  const example = `sources: ['${availableSources[0] ?? 'npm:<name>'}']`;
  const instruction = `${getLayout().indent(1)}Add to "sources" in the readyup config, e.g. ${example}`;
  const items = availableSources.map((name) => ({ name }));
  return formatSection('Available', instruction, items, 'sourcePackage');
}

/**
 * Returns a titled section: the title, `hintLine` beneath it, then the kits.
 *
 * `hintLine` is passed in already indented, because a section headed by a command and one headed by an instruction are
 * built differently and only the caller knows which one it is. Nothing inside is separated by a blank line:
 * The hint is directly beneath the title so that it reads as part of the heading, the kits are directly
 * beneath the hint, and the blank separating one section from the next is added by whoever assembles them.
 */
function formatSection(
  title: string,
  hintLine: string,
  kits: KitView[],
  token: TokenName,
  shouldShowChecks = false,
): string {
  const items = kits.flatMap((kit) => formatKitRows(kit, token, { shouldShowChecks }));
  return [getLayout().formatHeading(title, 'section'), hintLine, ...items].join('\n');
}

/** Returns one source's heading, the command running its kits, and a line per kit. */
function formatSourceBlock(group: SourceGroup, shouldShowChecks: boolean): string {
  const heading = getLayout().formatBreadcrumb(
    [{ role: resolveSourceToken(group.kind), text: buildSourceLabel(group) }],
    'kit',
    group.configured ? undefined : UNCONFIGURED_DETAIL,
  );
  const items = group.kits.flatMap((kit) => formatKitRows(toKitView(kit), 'kit', { shouldShowChecks }));

  return [heading, buildRunLine(buildSourceHint(group)), ...items].join('\n');
}

// endregion | Helpers
