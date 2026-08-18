import path from 'node:path';

import type { KitPackageGroup } from '../installed-packages/collectKitPackageGroups.ts';
import { KITS_DIR } from '../kits/kitsDir.ts';
import { getLayout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';

/** Blank line parting one listed section from the next. A section supplies none of its own. */
const SECTION_SEPARATOR = '\n\n';

/** Detail marking a package the readyup config does not name. */
const UNCONFIGURED_DETAIL = 'not configured';

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
 * `renderFrom`. They coincide for a listing of the working directory, and part for a sweep rendering
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
 * Format the owner-mode output showing internal and compiled kit sections.
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
    const hint = `rdy run --jit${internalFlag} ${buildKitHint(internalKits)}`;
    sections.push(formatSection('Internal', hint, internalKits, 'kitSource'));
  }

  if (compiledKits.length > 0) {
    if (compiledStyle.kind === 'local-convention') {
      const hint = `rdy run ${buildKitHint(compiledKits)}`;
      sections.push(formatSection('Compiled', hint, compiledKits, 'kit'));
    } else {
      const hint = `rdy run --file <file path>`;
      const pathItems = compiledKits.map((name) => `${compiledStyle.outDirRel}/${name}.js`);
      sections.push(formatSection('Compiled', hint, pathItems, 'kit'));
    }
  }

  if (packageKits.length > 0) {
    // The rows stay every published kit — discovery is not run selection — so the bracketed optional keeps
    // the promise that every kit listed is reachable by the command above it.
    sections.push(formatSection('Packages', 'rdy run --packages [<name>]', packageKits, 'sourcePackage'));
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
 * Format the consumer-mode output showing compiled kits at a local path.
 *
 * Returns the empty-consumer message when the kit list is empty.
 */
export function formatConsumerView({ compiledKits, fromArg, kitsDir }: ConsumerViewOptions): string {
  if (compiledKits.length === 0) {
    return formatEmpty('consumer', kitsDir);
  }

  const hint = `rdy run --from ${fromArg} ${buildKitHint(compiledKits)}`;
  return formatSection('Compiled', hint, compiledKits, 'kit');
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
 * the hint each block carries, which names the command that runs that package's kits.
 *
 * A sweep with no groups returns the empty-packages message.
 */
export function formatPackagesView({ groups }: PackagesViewOptions): string {
  return groups.length === 0 ? formatEmpty('packages') : groups.map(formatPackageBlock).join(SECTION_SEPARATOR);
}

// -- Recursive view --

/** One kit a recursive listing reports, carrying the description its project's manifest records. */
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

// -- Empty messages --

/** Format the "no kits found" message appropriate to the given mode. */
export function formatEmpty(mode: 'owner' | 'consumer' | 'packages' | 'recursive', kitsDir?: string): string {
  if (mode === 'consumer') {
    return `No compiled kits found at ${kitsDir ?? '.readyup/kits'}.`;
  }
  if (mode === 'packages') {
    return 'No installed dependency publishes kits.';
  }
  if (mode === 'recursive') {
    return 'No kit projects found.';
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
 * A kit's line carries its version as a parenthetical and its description as inline detail, each present
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
 * by the source naming it directly. So one hint answers both what to run and whether a `--packages` run
 * would include it, and every kit listed stays reachable by the command above it.
 */
function buildPackageHint(group: KitPackageGroup): string {
  const nameHint = buildKitHint(group.kits.map((kit) => kit.kitName));
  return group.configured ? `rdy run --packages ${nameHint}` : `rdy run --from npm:${group.packageName} ${nameHint}`;
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

/** Returns the section naming installed packages that publish kits the config does not list. */
function formatAvailableSection(availablePackages: string[]): string {
  return formatSection('Available', 'Add to "packages" in the readyup config', availablePackages, 'sourcePackage');
}

/** Returns one package's heading, the command running its kits, and a line per kit. */
function formatPackageBlock(group: KitPackageGroup): string {
  const label = group.version === undefined ? group.packageName : `${group.packageName}@${group.version}`;
  const heading = getLayout().formatBreadcrumb(
    [{ role: 'sourcePackage', text: label }],
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

  return [heading, `${getLayout().indent(1)}${buildPackageHint(group)}`, ...items].join('\n');
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

  return [heading, `${getLayout().indent(1)}${buildProjectHint(project)}`, ...items].join('\n');
}

/**
 * Returns a titled section: the title, `hint` indented beneath it, then the kits.
 *
 * Nothing inside is parted by a blank line. `hint` sits against the title so the command reads as part of
 * the heading, the kits sit against the hint, and the blank parting one section from the next belongs to
 * whoever assembles them.
 */
function formatSection(title: string, hint: string, kits: string[], token: TokenName): string {
  const items = kits.map((name) => getLayout().formatCheckLine({ token, name }));
  return [getLayout().formatHeading(title, 'section'), `${getLayout().indent(1)}${hint}`, ...items].join('\n');
}

/** Returns what a kit's row is named: its bare name, or the path a `--file` invocation needs. */
function resolveKitLabel(compiledStyle: CompiledStyle, name: string): string {
  return compiledStyle.kind === 'custom-outDir' ? `${compiledStyle.outDirRel}/${name}.js` : name;
}

// endregion | Helpers
