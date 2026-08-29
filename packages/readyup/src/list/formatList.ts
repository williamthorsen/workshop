import path from 'node:path';

import type { KitPackageGroup } from '../installed-packages/collectKitPackageGroups.ts';
import { KITS_DIR } from '../kits/kitsDir.ts';
import { getLayout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';

/** Blank line separating one listed section from the next. A section supplies none of its own. */
const SECTION_SEPARATOR = '\n\n';

/** Detail marking a package the readyup config does not name. */
const UNCONFIGURED_DETAIL = 'not listed in the readyup config';

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
 * `projectDir`; the path a reader is shown has to resolve from where they stand, so it is named against
 * `renderFrom`. They coincide for a listing of the working directory, and diverge for a sweep rendering
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
  internalKits: string[];
  compiledKits: string[];
  compiledStyle: CompiledStyle;
  needsInternalFlag?: boolean;
  packageKits?: string[];
  availablePackages?: string[];
}

/**
 * Returns the owner-mode output, showing the internal and compiled kit sections.
 *
 * Empty sections are omitted. Returns the empty-owner message when both lists are empty.
 *
 * `needsInternalFlag` adds `--internal` to the internal-section hint. The flag is what makes a
 * configured internal directory or infix reachable, so the hint would name a failing command
 * without it; the default config needs neither, and omitting it keeps the shorter form.
 */
export function formatOwnerView({
  internalKits,
  compiledKits,
  compiledStyle,
  needsInternalFlag = false,
  packageKits = [],
  availablePackages = [],
}: OwnerViewOptions): string {
  if (internalKits.length === 0 && compiledKits.length === 0 && packageKits.length === 0) {
    // A project with no kits of its own is still told what its dependencies offer, which is the one thing that
    // turns an empty listing into a next step.
    return availablePackages.length === 0
      ? formatEmpty('owner')
      : [formatEmpty('owner'), formatAvailableSection(availablePackages)].join(SECTION_SEPARATOR);
  }

  const sections: string[] = [];

  if (internalKits.length > 0) {
    const internalFlag = needsInternalFlag ? ' --internal' : '';
    const command = `rdy run --jit${internalFlag} ${buildKitHint(internalKits)}`;
    sections.push(formatSection('Internal', buildRunLine(command), internalKits, 'kitSource'));
  }

  if (compiledKits.length > 0) {
    if (compiledStyle.kind === 'local-convention') {
      const command = `rdy run ${buildKitHint(compiledKits)}`;
      sections.push(formatSection('Compiled', buildRunLine(command), compiledKits, 'kit'));
    } else {
      const pathItems = compiledKits.map((name) => `${compiledStyle.outDirRel}/${name}.js`);
      sections.push(formatSection('Compiled', buildRunLine('rdy run --file <file path>'), pathItems, 'kit'));
    }
  }

  if (packageKits.length > 0) {
    // The rows stay every published kit -- discovery is not run selection -- so the bracketed optional keeps
    // the promise that every kit listed is reachable by the command above it.
    sections.push(formatSection('Packages', buildRunLine('rdy run --packages [<name>]'), packageKits, 'sourcePackage'));
  }

  if (availablePackages.length > 0) {
    sections.push(formatAvailableSection(availablePackages));
  }

  return sections.join(SECTION_SEPARATOR);
}

// -- Consumer view --

interface ConsumerViewOptions {
  compiledKits: string[];
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

  const command = `rdy run --from ${fromArg} ${buildKitHint(compiledKits)}`;
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
 * sections, so a reader asking what their dependencies publish reads one answer. What separates them is
 * the hint each block shows, which names the command that runs that package's kits.
 *
 * A sweep with no groups returns the empty-packages message.
 */
export function formatPackagesView({ groups }: PackagesViewOptions): string {
  return groups.length === 0 ? formatEmpty('packages') : groups.map(formatPackageBlock).join(SECTION_SEPARATOR);
}

// -- Recursive view --

/** One kit a recursive listing reports, with the description its project's manifest records. */
export interface RecursiveKitView {
  name: string;
  description?: string | undefined;
}

/** One discovered project's contribution to a recursive listing. */
export interface RecursiveProjectView {
  /** Path relative to the sweep root, POSIX-separated; `'.'` for the root itself. */
  dir: string;
  compiledKits: RecursiveKitView[];
  /** Resolved against the sweep root, so a custom-`outDir` row names a path that works from there. */
  compiledStyle: CompiledStyle;
}

interface RecursiveViewOptions {
  projects: RecursiveProjectView[];
}

/**
 * Formats the repo-wide output: one block per project, headed by the directory its kits live in.
 *
 * A project with nothing compiled contributes no block at all, heading included, so a caller may hand
 * over every project discovery found. A sweep left with no block returns the empty-sweep message.
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
 * this view would otherwise need are a stroke apart, and the roles they would mark are already told apart
 * by their glyphs; plain style, whose role glyphs are empty, reads the same three levels off the indent.
 *
 * A project with no kit-publishing dependency contributes no block at all, its directory line included, so
 * a caller may hand over every project discovery found. A sweep left with no block returns the empty
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
  kits: Array<{ name: string; description?: string | undefined; readyupVersion?: string | undefined }>;
  manifestPath: string;
}

/**
 * Returns a heading naming the manifest, then one line per kit.
 *
 * A kit's line shows its version as a parenthetical and its description as inline detail, each present
 * only when the manifest records it. The `readyup` label distinguishes the runner's version from a
 * version the kit might declare for itself.
 */
export function formatManifestView({ kits, manifestPath }: ManifestViewOptions): string {
  if (kits.length === 0) {
    return `No kits found in manifest: ${manifestPath}`;
  }

  const items = kits.map((kit) => {
    const versionSegment = kit.readyupVersion !== undefined ? ` (readyup v${kit.readyupVersion})` : '';
    return getLayout().formatCheckLine({
      token: 'kit',
      name: `${kit.name}${versionSegment}`,
      ...(kit.description !== undefined && { detail: kit.description }),
    });
  });

  return [getLayout().formatHeading(`Manifest: ${manifestPath}`, 'section'), ...items].join('\n');
}

// region | Helpers

/** Returns the positional-name placeholder, bracketed when `kits` contains a default. */
function buildKitHint(kits: string[]): string {
  return kits.includes('default') ? '[<name>]' : '<name>';
}

/**
 * Returns the command that runs a package's kits, which is also what marks the package as configured.
 *
 * `rdy run --packages` reaches only the packages the config names, and every other package is reachable
 * by the source naming it directly. So one hint covers both what to run and whether a `--packages` run
 * would include it, and every kit listed stays reachable by the command above it.
 */
function buildPackageHint(group: KitPackageGroup): string {
  const nameHint = buildKitHint(group.kits.map((kit) => kit.kitName));
  return group.configured ? `rdy run --packages ${nameHint}` : `rdy run --from npm:${group.packageName} ${nameHint}`;
}

/** Returns a package's name with the version its own manifest records, where it records one. */
function buildPackageLabel(group: KitPackageGroup): string {
  return group.version === undefined ? group.packageName : `${group.packageName}@${group.version}`;
}

/**
 * Returns the command that runs a project's kits from where the reader stands.
 *
 * A project on a custom `outDir` is reachable only by file: every other resolution path hardcodes the
 * convention directory.
 */
function buildProjectHint(project: RecursiveProjectView): string {
  if (project.compiledStyle.kind === 'custom-outDir') {
    return 'rdy run --file <file path>';
  }

  const nameHint = buildKitHint(project.compiledKits.map((kit) => kit.name));
  return project.dir === '.' ? `rdy run ${nameHint}` : `rdy run --from ${project.dir} ${nameHint}`;
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
 * The label is what separates the line from the kit rows sharing its column: the role glyphs those rows
 * show are empty in plain style, so without it the command reads as one more kit.
 */
function buildRunLine(command: string, depth = 1): string {
  return `${getLayout().indent(depth)}To run: ${command}`;
}

/**
 * Returns the section naming installed packages that publish kits the config does not list.
 *
 * Its line heads the section with what to do about those packages rather than a command to run, so it
 * has no `To run:` label.
 */
function formatAvailableSection(availablePackages: string[]): string {
  const instruction = `${getLayout().indent(1)}Add to "packages" in the readyup config`;
  return formatSection('Available', instruction, availablePackages, 'sourcePackage');
}

/** Returns one package's line under a project's directory, the command running its kits, and a line per kit. */
function formatNestedPackageBlock(group: KitPackageGroup, runPrefix: string): string {
  const packageLine = getLayout().formatCheckLine({
    token: 'sourcePackage',
    name: buildPackageLabel(group),
    depth: 1,
    ...(!group.configured && { detail: UNCONFIGURED_DETAIL }),
  });
  const items = group.kits.map((kit) =>
    getLayout().formatCheckLine({
      token: 'kit',
      name: kit.kitName,
      depth: 2,
      ...(kit.description !== undefined && { detail: kit.description }),
    }),
  );

  return [packageLine, buildRunLine(`${runPrefix}${buildPackageHint(group)}`, 2), ...items].join('\n');
}

/** Returns one package's heading, the command running its kits, and a line per kit. */
function formatPackageBlock(group: KitPackageGroup): string {
  const heading = getLayout().formatBreadcrumb(
    [{ role: 'sourcePackage', text: buildPackageLabel(group) }],
    'kit',
    group.configured ? undefined : UNCONFIGURED_DETAIL,
  );
  const items = group.kits.map((kit) =>
    getLayout().formatCheckLine({
      token: 'kit',
      name: kit.kitName,
      ...(kit.description !== undefined && { detail: kit.description }),
    }),
  );

  return [heading, buildRunLine(buildPackageHint(group)), ...items].join('\n');
}

/** Returns one project's heading, the command running its kits, and a line per kit. */
function formatProjectBlock(project: RecursiveProjectView): string {
  const heading = getLayout().formatBreadcrumb([{ role: 'sourceDirectory', text: `${project.dir}/` }], 'kit');
  const items = project.compiledKits.map((kit) =>
    getLayout().formatCheckLine({
      token: 'kit',
      name: resolveKitLabel(project.compiledStyle, kit.name),
      ...(kit.description !== undefined && { detail: kit.description }),
    }),
  );

  return [heading, buildRunLine(buildProjectHint(project)), ...items].join('\n');
}

/**
 * Returns one project's directory line, then a block per kit-publishing dependency beneath it.
 *
 * The directory sits directly above its first package, which is what makes the blank lines within the
 * block read as separating one package from the next rather than the directory from what it heads.
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
 * `hintLine` arrives indented, because a section headed by a command and one headed by an instruction are
 * built differently and only the caller knows which it holds. Nothing inside is separated by a blank line:
 * the hint sits against the title so it reads as part of the heading, the kits sit against the hint, and
 * the blank separating one section from the next belongs to whoever assembles them.
 */
function formatSection(title: string, hintLine: string, kits: string[], token: TokenName): string {
  const items = kits.map((name) => getLayout().formatCheckLine({ token, name }));
  return [getLayout().formatHeading(title, 'section'), hintLine, ...items].join('\n');
}

/** Returns what a kit's row is named: its bare name, or the path a `--file` invocation needs. */
function resolveKitLabel(compiledStyle: CompiledStyle, name: string): string {
  return compiledStyle.kind === 'custom-outDir' ? `${compiledStyle.outDirRel}/${name}.js` : name;
}

// endregion | Helpers
