import path from 'node:path';

import { KITS_DIR } from '../kits/kitsDir.ts';
import { getLayout } from '../layout/engine.ts';
import type { SourceGroup } from '../sources/collectSourceGroups.ts';
import { formatEmpty } from './formatList.ts';
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

/**
 * Command that runs a kit by file, which takes no kit name and so selects checklists by flag alone.
 *
 * The kits of another project below the sweep root are reachable only this way: Naming one resolves it
 * against the config of the reader's working directory, which is not the config that set where the kit was
 * compiled.
 */
const FILE_RUN_COMMAND = 'rdy run --file <file path> [--checklists <checklist>,...]';

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
  shouldShowChecks?: boolean;
}

/**
 * Formats the repo-wide output: one block per project, headed by the directory in which its kits live.
 *
 * A caller may hand over every project found by discovery, because a project with nothing compiled
 * contributes no block at all, heading included. A sweep left with no block returns the empty-sweep message.
 */
export function formatRecursiveView({ projects, shouldShowChecks = false }: RecursiveViewOptions): string {
  const blocks = projects
    .filter((project) => project.compiledKits.length > 0)
    .map((project) => formatProjectBlock(project, shouldShowChecks));

  return blocks.length === 0 ? formatEmpty('recursive') : blocks.join(SECTION_SEPARATOR);
}

// -- Repo-wide dependency view --

/** One discovered project's contribution to a repo-wide dependency listing. */
export interface ProjectSourcesView {
  /** Path relative to the sweep root, POSIX-separated; `'.'` for the root itself. */
  dir: string;
  groups: SourceGroup[];
}

interface RecursiveSourcesViewOptions {
  projects: ProjectSourcesView[];
  shouldShowChecks?: boolean;
}

/**
 * Formats the repo-wide dependency output: each project's directory, then a block per kit-publishing dependency.
 *
 * Nesting comes from the glyph and the indentation rather than from a heading rule. The two heading rules
 * that this view would otherwise need differ only in stroke weight, and the glyphs already distinguish the
 * roles that they would mark; in plain style, whose role glyphs are empty, the indent alone shows the same
 * three levels.
 *
 * A project with no kit-publishing dependency contributes no block at all, its directory line included, so
 * a caller may hand over every project found by discovery. A sweep left with no block returns the empty
 * message.
 */
export function formatRecursiveSourcesView({
  projects,
  shouldShowChecks = false,
}: RecursiveSourcesViewOptions): string {
  const blocks = projects
    .filter((project) => project.groups.length > 0)
    .map((project) => formatProjectSourcesBlock(project, shouldShowChecks));

  return blocks.length === 0 ? formatEmpty('recursive-sources') : blocks.join(SECTION_SEPARATOR);
}

// region | Helpers

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

/** Returns one source's line under a project's directory, the command running its kits, and a line per kit. */
function formatNestedSourceBlock(group: SourceGroup, runPrefix: string, shouldShowChecks: boolean): string {
  const sourceLine = getLayout().formatCheckLine({
    token: resolveSourceToken(group.kind),
    name: buildSourceLabel(group),
    depth: 1,
    ...(!group.configured && { detail: UNCONFIGURED_DETAIL }),
  });
  const items = group.kits.flatMap((kit) => formatKitRows(toKitView(kit), 'kit', { depth: 2, shouldShowChecks }));

  return [sourceLine, buildRunLine(`${runPrefix}${buildSourceHint(group)}`, 2), ...items].join('\n');
}

/** Returns one project's heading, the command running its kits, and a line per kit. */
function formatProjectBlock(project: RecursiveProjectView, shouldShowChecks: boolean): string {
  const heading = getLayout().formatBreadcrumb([{ role: 'sourceDirectory', text: `${project.dir}/` }], 'kit');
  const items = project.compiledKits.flatMap((kit) =>
    formatKitRows({ ...kit, name: resolveKitLabel(project.compiledStyle, kit.name) }, 'kit', { shouldShowChecks }),
  );

  return [heading, buildRunLine(buildProjectHint(project)), ...items].join('\n');
}

/**
 * Returns one project's directory line, then a block per kit-publishing dependency beneath it.
 *
 * The directory line is directly above its first source, so a reader takes the blank lines within the
 * block as separating one source from the next rather than the directory from what it heads.
 */
function formatProjectSourcesBlock(project: ProjectSourcesView, shouldShowChecks: boolean): string {
  const directory = getLayout().formatCheckLine({ token: 'sourceDirectory', name: `${project.dir}/` });
  const runPrefix = buildProjectPrefix(project.dir);
  const blocks = project.groups.map((group) => formatNestedSourceBlock(group, runPrefix, shouldShowChecks));

  return [directory, blocks.join(SECTION_SEPARATOR)].join('\n');
}

/** Returns what a kit's row is named: its bare name, or the path needed by a `--file` invocation. */
function resolveKitLabel(compiledStyle: CompiledStyle, name: string): string {
  return compiledStyle.kind === 'custom-outDir' ? `${compiledStyle.outDirRel}/${name}.js` : name;
}

// endregion | Helpers
