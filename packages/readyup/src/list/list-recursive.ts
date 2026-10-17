import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { writeHuman } from '../output/writeHuman.ts';
import { isSkippableFilesystemError } from '../portable/isSkippableFilesystemError.ts';
import { discoverKitProjects, discoverProjects, type Project } from '../projects/project-discovery.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import type { JsonListKitEntry } from '../schemas/listOutputSchema.ts';
import { collectSourceGroups } from '../sources/collectSourceGroups.ts';
import { collectCompiledKits } from './collectCompiledKits.ts';
import {
  formatRecursiveSourcesView,
  formatRecursiveView,
  type ProjectSourcesView,
  type RecursiveProjectView,
  resolveCompiledStyle,
} from './formatList.ts';
import { finishList, type ListOutputOptions, warnOfUnreadableManifest } from './list-output.ts';
import { buildSourceKitEntry } from './source-kit-entries.ts';

/**
 * Enumerates the compiled kits of every kit project below the working directory.
 *
 * Compiled kits only: An internal kit is never reachable from another directory, since `--jit` and
 * `--internal` reject every source flag, and a configured package's kits belong to the dependency axis.
 * What is left is exactly the set that a reader can run from the working directory.
 */
export async function runRecursiveMode(output: ListOutputOptions): Promise<number> {
  const root = process.cwd();
  const projects = await discoverKitProjects({ root });
  warnOfDefaultedConfigs(projects);

  const views: RecursiveProjectView[] = [];
  const entries: JsonListKitEntry[] = [];

  for (const project of projects) {
    const kits = collectProjectKits(project);
    views.push({
      dir: project.dir,
      compiledKits: kits.map(({ name, description, checklists, checklistChecks }) => ({
        name,
        description,
        checklists,
        checklistChecks,
      })),
      compiledStyle: resolveCompiledStyle(project.absolutePath, project.config.compile.outDir, root),
    });
    entries.push(...kits);
  }

  writeHuman(formatRecursiveView({ projects: views, showChecks: output.showChecks }) + '\n', output.json);

  return finishList(entries, output);
}

/**
 * Enumerates the kit sources of every project below the working directory.
 *
 * Both axes at once: The locality named by `--recursive` and the provenance named by `--sources`. The sweep
 * is every project rather than every kit project, because a workspace authoring no kits of its own still
 * declares dependencies that publish them, and that workspace is the one that the question is about.
 *
 * Each project's sources are read under its own config, so a source that one workspace configures and
 * another does not is reported as configured only for the workspace that configures it. A repository that several
 * projects name, and that cannot be fetched, is warned of once per project naming it.
 */
export async function runRecursiveSourcesMode(output: ListOutputOptions, remote: RemoteFetchContext): Promise<number> {
  const projects = await discoverProjects({ root: process.cwd() });
  warnOfDefaultedConfigs(projects);

  const views: ProjectSourcesView[] = [];
  const entries: JsonListKitEntry[] = [];

  for (const project of projects) {
    const groups = await collectSourceGroups({
      configuredSources: project.config.sources,
      fromDir: project.absolutePath,
      remote,
    });

    views.push({ dir: project.dir, groups });
    entries.push(
      ...groups.flatMap((group) => group.kits.map((kit) => buildSourceKitEntry(kit, group.configured, project.dir))),
    );
  }

  writeHuman(formatRecursiveSourcesView({ projects: views, showChecks: output.showChecks }) + '\n', output.json);

  return finishList(entries, output);
}

// region | Helpers

/**
 * Reads one project's compiled kits for a repo-wide listing.
 *
 * For a project whose manifest nobody can read, the listing omits the descriptions but keeps the kits: The kits
 * themselves are still on disk. A project whose output directory cannot be read is omitted, and the sweep moves on.
 */
function collectProjectKits(project: Project): JsonListKitEntry[] {
  const outDir = path.resolve(project.absolutePath, project.config.compile.outDir);

  try {
    return collectCompiledKits({
      manifestPath: project.manifestPath,
      onUnreadableManifest: warnOfUnreadableManifest,
      outDir,
      project: project.dir,
    });
  } catch (error: unknown) {
    if (!isSkippableFilesystemError(error)) throw error;
    process.stderr.write(`Warning: Cannot read ${outDir}. Omitting ${project.dir} from the listing.\n`);
    return [];
  }
}

/**
 * Warns of each swept project whose config could not be evaluated, which the listing reads with default settings.
 *
 * Listing is read-only, so it takes the same warn-and-continue that `loadListingConfig` takes for the working directory.
 */
function warnOfDefaultedConfigs(projects: Project[]): void {
  for (const { configError, dir } of projects) {
    if (configError === undefined) continue;
    const detail = describeError(configError).replace(/\.$/, '');
    process.stderr.write(`Warning: ${detail}. Reading ${dir} with default settings.\n`);
  }
}

// endregion | Helpers
