import path from 'node:path';

import type { KitPackageGroup } from '../installed-packages/collectKitPackageGroups.ts';
import type { PackageKit } from '../installed-packages/expandConfiguredPackages.ts';
import { KITS_DIR } from '../kits/kitsDir.ts';
import { getLayout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';

/** Blank line separating one listed section from the next. A section supplies none of its own. */
const SECTION_SEPARATOR = '\n\n';

/** Detail marking a package that the readyup config does not name. */
const UNCONFIGURED_DETAIL = 'not listed in the readyup config';

/**
 * Command that runs a kit by file, which takes no kit name and so selects checklists by flag alone.
 *
 * The kits of another project below the sweep root are reachable only this way: Naming one resolves it
 * against the config of the reader's working directory, which is not the config that set where the kit was
 * compiled.
 */
const FILE_RUN_COMMAND = 'rdy run --file <file path> [--checklists <checklist>,...]';

// -- Kit rows --

/** One listed kit, with the description and checklist names that its manifest records. */
export interface KitView {
  name: string;
  description?: string | undefined;
  checklists?: readonly string[] | undefined;
}

// -- Compiled-section style discriminants --

export interface LocalConventionStyle {
  kind: 'local-convention';
}

export interface CustomOutDirStyle {
  kind: 'custom-outDir';
  outDirRel: string;
}

export type CompiledStyle = LocalConventionStyle | CustomOutDirStyle;

/**
 * Determines the compiled-section display style for a project's `outDir`.
 *
 * Whether an `outDir` is the convention is a fact about the project, so it is settled against
 * `projectDir`. Because the path shown to a reader has to resolve from the reader's working directory, it is
 * named against `renderFrom`. They coincide for a listing of the working directory, and diverge for a sweep rendering
 * another project's kits.
 */
export function resolveCompiledStyle(projectDir: string, outDir: string, renderFrom: string): CompiledStyle {
  const resolvedOutDir = path.resolve(projectDir, outDir);
  const defaultOutDir = path.resolve(projectDir, KITS_DIR);

  if (resolvedOutDir === defaultOutDir) {
    return { kind: 'local-convention' };
  }

  return { kind: 'custom-outDir', outDirRel: path.relative(renderFrom, resolvedOutDir) };
}

// -- Owner view --

interface OwnerViewOptions {
  sourceKits?: string[];
  internalKits: string[];
  compiledKits: KitView[];
  packageKits?: KitView[];
  availablePackages?: string[];
}

/**
 * Returns the owner-mode output, showing the source, internal, and compiled kit sections.
 *
 * Empty sections are omitted. Returns the empty-owner message when every list is empty.
 *
 * The two source sections are separate axes rather than one section under two names: `sourceKits` lists
 * what `compile.include` and `compile.exclude` select, which `rdy run --jit` runs, and `internalKits` lists
 * the bucket that `internal.dir` and `internal.infix` declare, which needs `--internal` as well. A caller
 * whose config declares neither key passes no internal kits, because `--internal` would then resolve every
 * name exactly as plain `--jit` does and its rows would restate the source rows above them.
 *
 * Every compiled kit is named rather than pathed, whatever `compile.outDir` is set to, because this view
 * reports the kits of the reader's working directory and `rdy run <kit>` reads that project's own
 * `outDir`. Only the repo-wide view, whose rows belong to other projects, still has to name them by path.
 */
export function formatOwnerView({
  sourceKits = [],
  internalKits,
  compiledKits,
  packageKits = [],
  availablePackages = [],
}: OwnerViewOptions): string {
  if (sourceKits.length === 0 && internalKits.length === 0 && compiledKits.length === 0 && packageKits.length === 0) {
    // The listing for a project with no kits of its own still shows what its dependencies offer, which is the
    // one next step that an empty listing can give.
    return availablePackages.length === 0
      ? formatEmpty('owner')
      : [formatEmpty('owner'), formatAvailableSection(availablePackages)].join(SECTION_SEPARATOR);
  }

  const sections: string[] = [];

  if (sourceKits.length > 0) {
    const command = `rdy run --jit ${buildKitSelectionHint(sourceKits)}`;
    const items = sourceKits.map((name) => ({ name }));
    sections.push(formatSection('Sources', buildRunLine(command), items, 'kitSource'));
  }

  if (internalKits.length > 0) {
    const command = `rdy run --jit --internal ${buildKitSelectionHint(internalKits)}`;
    const items = internalKits.map((name) => ({ name }));
    sections.push(formatSection('Internal', buildRunLine(command), items, 'kitSource'));
  }

  if (compiledKits.length > 0) {
    const command = `rdy run ${buildKitSelectionHint(compiledKits.map((kit) => kit.name))}`;
    sections.push(formatSection('Compiled', buildRunLine(command), compiledKits, 'kit'));
  }

  if (packageKits.length > 0) {
    // The rows list every published kit -- discovery is not run selection -- so the bracketed optional name
    // ensures that the command above the rows can run every kit listed.
    sections.push(formatSection('Packages', buildRunLine('rdy run --packages [<kit>]'), packageKits, 'sourcePackage'));
  }

  if (availablePackages.length > 0) {
    sections.push(formatAvailableSection(availablePackages));
  }

  return sections.join(SECTION_SEPARATOR);
}

// -- Consumer view --

interface ConsumerViewOptions {
  compiledKits: KitView[];
  fromArg: string;
  kitsDir: string;
}

/**
 * Returns the consumer-mode output, showing the compiled kits at a local path.
 *
 * Returns the empty-consumer message when the kit list is empty.
 */
export function formatConsumerView({ compiledKits, fromArg, kitsDir }: ConsumerViewOptions): string {
  if (compiledKits.length === 0) {
    return formatEmpty('consumer', kitsDir);
  }

  const command = `rdy run --from ${fromArg} ${buildKitSelectionHint(compiledKits.map((kit) => kit.name))}`;
  return formatSection('Compiled', buildRunLine(command), compiledKits, 'kit');
}

// -- Packages view --

interface PackagesViewOptions {
  groups: KitPackageGroup[];
}

/**
 * Formats the dependency-axis output: one block per kit-publishing package, headed by the package.
 *
 * Configured and unconfigured packages interleave in one alphabetical list rather than splitting into
 * sections, so a reader asking what their dependencies publish reads one answer. The hint shown by each
 * block separates them: It names the command that runs that package's kits.
 *
 * A sweep with no groups returns the empty-packages message.
 */
export function formatPackagesView({ groups }: PackagesViewOptions): string {
  return groups.length === 0 ? formatEmpty('packages') : groups.map(formatPackageBlock).join(SECTION_SEPARATOR);
}

// -- Recursive view --

/** One discovered project's contribution to a recursive listing. */
export interface RecursiveProjectView {
  /** Path relative to the sweep root, POSIX-separated; `'.'` for the root itself. */
  dir: string;
  compiledKits: KitView[];
  /** Resolved against the sweep root, so a custom-`outDir` row names a path that works from there. */
  compiledStyle: CompiledStyle;
}

interface RecursiveViewOptions {
  projects: RecursiveProjectView[];
}

/**
 * Formats the repo-wide output: one block per project, headed by the directory in which its kits live.
 *
 * A caller may hand over every project found by discovery, because a project with nothing compiled
 * contributes no block at all, heading included. A sweep left with no block returns the empty-sweep message.
 */
export function formatRecursiveView({ projects }: RecursiveViewOptions): string {
  const blocks = projects.filter((project) => project.compiledKits.length > 0).map(formatProjectBlock);

  return blocks.length === 0 ? formatEmpty('recursive') : blocks.join(SECTION_SEPARATOR);
}

// -- Repo-wide dependency view --

/** One discovered project's contribution to a repo-wide dependency listing. */
export interface ProjectPackagesView {
  /** Path relative to the sweep root, POSIX-separated; `'.'` for the root itself. */
  dir: string;
  groups: KitPackageGroup[];
}

interface RecursivePackagesViewOptions {
  projects: ProjectPackagesView[];
}

/**
 * Formats the repo-wide dependency output: each project's directory, then a block per kit-publishing dependency.
 *
 * Nesting comes from the glyph and the indentation rather than from a heading rule. The two rule weights
 * that this view would otherwise need differ only in stroke weight, and the glyphs already distinguish the
 * roles that they would mark; in plain style, whose role glyphs are empty, the indent alone shows the same
 * three levels.
 *
 * A project with no kit-publishing dependency contributes no block at all, its directory line included, so
 * a caller may hand over every project found by discovery. A sweep left with no block returns the empty
 * message.
 */
export function formatRecursivePackagesView({ projects }: RecursivePackagesViewOptions): string {
  const blocks = projects.filter((project) => project.groups.length > 0).map(formatProjectPackagesBlock);

  return blocks.length === 0 ? formatEmpty('recursive-packages') : blocks.join(SECTION_SEPARATOR);
}

// -- Empty messages --

/** Returns the "no kits found" message that suits the given mode. */
export function formatEmpty(
  mode: 'owner' | 'consumer' | 'packages' | 'recursive' | 'recursive-packages',
  kitsDir?: string,
): string {
  if (mode === 'consumer') {
    return `No compiled kits found at ${kitsDir ?? '.readyup/kits'}.`;
  }
  if (mode === 'packages') {
    return 'No installed dependency publishes kits.';
  }
  if (mode === 'recursive') {
    return 'No kit projects found.';
  }
  if (mode === 'recursive-packages') {
    return 'No dependency of any project below this directory publishes kits.';
  }
  return 'No kits found.\nRun `rdy init` to scaffold an internal kit or `rdy compile` to compile a kit from source.';
}

// -- Manifest view --

interface ManifestViewOptions {
  kits: Array<KitView & { readyupVersion?: string | undefined }>;
  manifestPath: string;
  /** The `--from` value that names the manifest's source; a manifest file read directly has none. */
  fromArg?: string | undefined;
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
export function formatManifestView({ fromArg, kits, manifestPath }: ManifestViewOptions): string {
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
    return formatKitRows({ ...kit, name: `${kit.name}${versionSegment}` }, 'kit');
  });

  return [heading, ...hintLines, ...items].join('\n');
}

// region | Helpers

/** Returns `hint` wrapped in brackets when `kits` contains a default, which a run naming no kit selects. */
function bracketIfDefault(hint: string, kits: readonly string[]): string {
  return kits.includes('default') ? `[${hint}]` : hint;
}

/**
 * Returns the kit placeholder for a source that selects kits by name alone, bracketed when `kits` contains a default.
 *
 * `--packages` is that source: It rejects a checklist filter, since the kit that it names may be published by
 * several packages.
 */
function buildKitHint(kits: readonly string[]): string {
  return bracketIfDefault('<kit>', kits);
}

/**
 * Returns the kit placeholder with the checklist filter that may follow it, bracketed when `kits` contains a default.
 *
 * The bracket wraps the filter too, because a filter needs a kit name before it.
 */
function buildKitSelectionHint(kits: readonly string[]): string {
  return bracketIfDefault('<kit>[:<checklist>,...]', kits);
}

/**
 * Returns the command that runs a package's kits, which also marks the package as configured.
 *
 * `rdy run --packages` includes only the packages named by the config, and every other package is reachable
 * by the source naming it directly. So one hint covers both what to run and whether a `--packages` run
 * would include it, and every kit listed stays reachable by the command above it.
 */
function buildPackageHint(group: KitPackageGroup): string {
  const kitNames = group.kits.map((kit) => kit.kitName);
  return group.configured
    ? `rdy run --packages ${buildKitHint(kitNames)}`
    : `rdy run --from npm:${group.packageName} ${buildKitSelectionHint(kitNames)}`;
}

/** Returns a package's name with the version that its own manifest records, if it records one. */
function buildPackageLabel(group: KitPackageGroup): string {
  return group.version === undefined ? group.packageName : `${group.packageName}@${group.version}`;
}

/** Returns the command that runs a project's kits from the reader's working directory. */
function buildProjectHint(project: RecursiveProjectView): string {
  if (project.compiledStyle.kind === 'custom-outDir') {
    return FILE_RUN_COMMAND;
  }

  const selectionHint = buildKitSelectionHint(project.compiledKits.map((kit) => kit.name));
  return project.dir === '.' ? `rdy run ${selectionHint}` : `rdy run --from ${project.dir} ${selectionHint}`;
}

/**
 * Returns what a dependency command needs to run from the sweep root, which is an empty string at the root itself.
 *
 * A workspace's own dependency is reachable from nowhere else: `rdy run` takes no directory, and `--from`
 * names a kit source rather than a working directory.
 */
function buildProjectPrefix(dir: string): string {
  return dir === '.' ? '' : `cd ${dir} && `;
}

/**
 * Returns the indented line naming the command that runs the kits beneath it.
 *
 * The label separates the line from the kit rows sharing its column: The role glyphs shown by those rows
 * are empty in plain style, so without it the command looks like one more kit row.
 */
function buildRunLine(command: string, depth = 1): string {
  return `${getLayout().indent(depth)}To run: ${command}`;
}

/**
 * Returns the section naming installed packages that publish kits not listed in the config.
 *
 * It has no `To run:` label, because its line heads the section with what to do about those packages
 * rather than a command to run.
 */
function formatAvailableSection(availablePackages: string[]): string {
  const instruction = `${getLayout().indent(1)}Add to "packages" in the readyup config`;
  const items = availablePackages.map((name) => ({ name }));
  return formatSection('Available', instruction, items, 'sourcePackage');
}

/**
 * Returns a kit's line, then a line one level deeper for each checklist that its manifest records.
 *
 * The checklists keep the manifest's order, which is the order in which the kit declares and runs them.
 */
function formatKitRows(kit: KitView, token: TokenName, depth = 0): string[] {
  const kitLine = getLayout().formatCheckLine({
    token,
    name: kit.name,
    depth,
    ...(kit.description !== undefined && { detail: kit.description }),
  });
  const checklistLines = (kit.checklists ?? []).map((name) =>
    getLayout().formatCheckLine({ token: 'checklist', name, depth: depth + 1 }),
  );

  return [kitLine, ...checklistLines];
}

/** Returns one package's line under a project's directory, the command running its kits, and a line per kit. */
function formatNestedPackageBlock(group: KitPackageGroup, runPrefix: string): string {
  const packageLine = getLayout().formatCheckLine({
    token: 'sourcePackage',
    name: buildPackageLabel(group),
    depth: 1,
    ...(!group.configured && { detail: UNCONFIGURED_DETAIL }),
  });
  const items = group.kits.flatMap((kit) => formatKitRows(toKitView(kit), 'kit', 2));

  return [packageLine, buildRunLine(`${runPrefix}${buildPackageHint(group)}`, 2), ...items].join('\n');
}

/** Returns one package's heading, the command running its kits, and a line per kit. */
function formatPackageBlock(group: KitPackageGroup): string {
  const heading = getLayout().formatBreadcrumb(
    [{ role: 'sourcePackage', text: buildPackageLabel(group) }],
    'kit',
    group.configured ? undefined : UNCONFIGURED_DETAIL,
  );
  const items = group.kits.flatMap((kit) => formatKitRows(toKitView(kit), 'kit'));

  return [heading, buildRunLine(buildPackageHint(group)), ...items].join('\n');
}

/** Returns one project's heading, the command running its kits, and a line per kit. */
function formatProjectBlock(project: RecursiveProjectView): string {
  const heading = getLayout().formatBreadcrumb([{ role: 'sourceDirectory', text: `${project.dir}/` }], 'kit');
  const items = project.compiledKits.flatMap((kit) =>
    formatKitRows({ ...kit, name: resolveKitLabel(project.compiledStyle, kit.name) }, 'kit'),
  );

  return [heading, buildRunLine(buildProjectHint(project)), ...items].join('\n');
}

/**
 * Returns one project's directory line, then a block per kit-publishing dependency beneath it.
 *
 * The directory line is directly above its first package, so a reader takes the blank lines within the
 * block as separating one package from the next rather than the directory from what it heads.
 */
function formatProjectPackagesBlock(project: ProjectPackagesView): string {
  const directory = getLayout().formatCheckLine({ token: 'sourceDirectory', name: `${project.dir}/` });
  const runPrefix = buildProjectPrefix(project.dir);
  const blocks = project.groups.map((group) => formatNestedPackageBlock(group, runPrefix));

  return [directory, blocks.join(SECTION_SEPARATOR)].join('\n');
}

/**
 * Returns a titled section: the title, `hintLine` beneath it, then the kits.
 *
 * `hintLine` is passed in already indented, because a section headed by a command and one headed by an instruction are
 * built differently and only the caller knows which one it is. Nothing inside is separated by a blank line:
 * The hint is directly beneath the title so that it reads as part of the heading, the kits are directly
 * beneath the hint, and the blank separating one section from the next is added by whoever assembles them.
 */
function formatSection(title: string, hintLine: string, kits: KitView[], token: TokenName): string {
  const items = kits.flatMap((kit) => formatKitRows(kit, token));
  return [getLayout().formatHeading(title, 'section'), hintLine, ...items].join('\n');
}

/** Returns what a kit's row is named: its bare name, or the path needed by a `--file` invocation. */
function resolveKitLabel(compiledStyle: CompiledStyle, name: string): string {
  return compiledStyle.kind === 'custom-outDir' ? `${compiledStyle.outDirRel}/${name}.js` : name;
}

/** Returns the row that a package's kit is listed as, named by the kit alone. */
function toKitView(kit: PackageKit): KitView {
  return { name: kit.kitName, description: kit.description, checklists: kit.checklists };
}

// endregion | Helpers
