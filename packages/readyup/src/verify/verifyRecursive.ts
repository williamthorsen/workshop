import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { pluralizeWithCount } from '@williamthorsen/toolbelt.strings';

import { RdyError } from '../errors/RdyError.ts';
import type { RdyManifest } from '../manifest/manifestSchema.ts';
import { writeError } from '../output/writeError.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { writeWarnings } from '../output/writeWarnings.ts';
import { discoverKitProjects, type Project } from '../projects/project-discovery.ts';
import type {
  JsonVerifyKitEntry,
  JsonVerifyProjectEntry,
  JsonVerifyUncompiledEntry,
} from '../schemas/verifyOutputSchema.ts';
import {
  defaultVerifyDependencies,
  findUncompiledKits,
  finishVerify,
  loadManifest,
  type VerifyDependencies,
  verifyManifest,
} from './verify-manifest.ts';

/** Arguments for the recursive verify path. */
export interface VerifyRecursiveArgs {
  rebuild: boolean;
  json: boolean;
}

/**
 * Verifies the kits of every kit project below the working directory, each against its own manifest.
 *
 * The sweep runs to completion across projects: A project that cannot be verified at all is reported, the
 * next project is tried, and the run fails. A project whose config cannot be evaluated is one of those, and
 * is never verified under the defaults with which discovery read it.
 */
export async function verifyRecursive(
  args: VerifyRecursiveArgs,
  dependencies: VerifyDependencies = defaultVerifyDependencies,
): Promise<number> {
  const { rebuild, json } = args;
  const root = process.cwd();
  const { projects, warnings: discoveryWarnings } = await discoverKitProjects({ root });
  writeWarnings(discoveryWarnings);

  if (projects.length === 0) {
    writeHuman('No kit projects found.\n', json);
    return finishVerify({ kits: [], passed: true, projects: [], uncompiled: [] }, json);
  }

  const kits: JsonVerifyKitEntry[] = [];
  const projectEntries: JsonVerifyProjectEntry[] = [];
  const uncompiled: JsonVerifyUncompiledEntry[] = [];
  let hasWrittenBlock = false;

  for (const project of projects) {
    const loaded = loadSweptProject(project, root, dependencies);
    if ('failure' in loaded) {
      projectEntries.push(reportProjectFailure(project.dir, loaded.failure));
      continue;
    }

    // No block is written for a project that fails before verifying, so separation follows the blocks actually written.
    if (hasWrittenBlock) writeHuman('\n', json);
    hasWrittenBlock = true;

    const outcome = await verifyManifest(
      {
        manifest: loaded.manifest,
        manifestPath: project.manifestPath,
        rebuild,
        json,
        project: project.dir,
        uncompiled: loaded.uncompiled,
      },
      dependencies,
    );
    kits.push(...outcome.kits);
    uncompiled.push(...outcome.uncompiled);
    projectEntries.push({ project: project.dir, passed: outcome.passed });
  }

  const failedDirs = projectEntries.filter((entry) => !entry.passed).map((entry) => entry.project);
  if (failedDirs.length > 0) {
    writeHuman(
      `\nProblems in ${failedDirs.length} of ${pluralizeWithCount(projects.length, 'project')}: ${failedDirs.join(', ')}\n`,
      json,
    );
  }

  return finishVerify({ kits, passed: failedDirs.length === 0, projects: projectEntries, uncompiled }, json);
}

// region | Helpers

/**
 * Reads a discovered project's manifest and finds its uncompiled kits, or describes why the project cannot be
 * verified.
 *
 * Only an `RdyError` is a project failure. Anything else is a defect in rdy, and ends the run.
 */
function loadSweptProject(
  project: Project,
  root: string,
  dependencies: VerifyDependencies,
): { manifest: RdyManifest; uncompiled: JsonVerifyUncompiledEntry[] } | { failure: string } {
  if (project.configError !== undefined) {
    return { failure: describeError(project.configError) };
  }

  if (!existsSync(project.manifestPath)) {
    const relManifestPath = path.relative(root, project.manifestPath);
    return { failure: `No manifest at ${relManifestPath}. Run \`rdy compile\` in ${project.dir} to create it.` };
  }

  try {
    const manifest = loadManifest(project.manifestPath, undefined, dependencies);
    const uncompiled = findUncompiledKits({
      manifest,
      manifestDir: path.dirname(project.manifestPath),
      srcDir: path.resolve(project.absolutePath, project.config.compile.srcDir),
      selection: project.config.compile,
      project: project.dir,
    });
    return { manifest, uncompiled };
  } catch (error: unknown) {
    if (!(error instanceof RdyError)) throw error;
    return { failure: error.message };
  }
}

/** Writes the failure of a project that could not be verified at all, and returns the project's entry. */
function reportProjectFailure(dir: string, message: string): JsonVerifyProjectEntry {
  writeError(message, dir);
  return { project: dir, passed: false, error: message };
}

// endregion | Helpers
