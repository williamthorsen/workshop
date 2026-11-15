import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { RdyError } from '../errors/RdyError.ts';
import type { RdyManifest } from '../manifest/manifestSchema.ts';
import type { ReportedWarning } from '../output/writeWarnings.ts';
import { discoverKitProjects, type Project } from '../projects/project-discovery.ts';
import type {
  JsonVerifyKitEntry,
  JsonVerifyProjectEntry,
  JsonVerifyUncompiledEntry,
} from '../schemas/verifyOutputSchema.ts';
import type { VerifyEvent } from './verify-events.ts';
import {
  defaultVerifyDependencies,
  findUncompiledKits,
  loadManifest,
  type VerifyDependencies,
  verifyManifest,
} from './verify-manifest.ts';

/** Arguments for the recursive verify path. */
export interface VerifyRecursiveArgs {
  shouldRebuild: boolean;
}

/**
 * Verifies the kits of every kit project below the working directory, each against its own manifest, yielding an
 * event at each step boundary and ending with the run's `verifyFinished` event.
 *
 * The sweep runs to completion across projects: A project that cannot be verified at all is reported, the
 * next project is tried, and the run fails. A project whose config cannot be evaluated is one of those, and
 * is never verified under the defaults with which discovery read it.
 */
export async function* verifyRecursive(
  args: VerifyRecursiveArgs,
  dependencies: VerifyDependencies = defaultVerifyDependencies,
): AsyncGenerator<VerifyEvent> {
  const { shouldRebuild } = args;
  const root = process.cwd();
  const discoveryWarnings: ReportedWarning[] = [];
  let projects: Project[];
  try {
    projects = await discoverKitProjects({ root }, discoveryWarnings);
  } catch (error: unknown) {
    // Yield the warnings raised before a failure too, so that they precede its error.
    yield { kind: 'discoveryFinished', warnings: discoveryWarnings };
    throw error;
  }
  yield { kind: 'discoveryFinished', warnings: discoveryWarnings };

  const kits: JsonVerifyKitEntry[] = [];
  const projectEntries: JsonVerifyProjectEntry[] = [];
  const uncompiled: JsonVerifyUncompiledEntry[] = [];

  for (const project of projects) {
    const loaded = loadSweptProject(project, root, dependencies);
    if ('failure' in loaded) {
      yield { kind: 'projectFailed', message: loaded.failure, project: project.dir };
      projectEntries.push({ project: project.dir, passed: false, error: loaded.failure });
      continue;
    }

    const outcome = yield* verifyManifest(
      {
        manifest: loaded.manifest,
        manifestPath: project.manifestPath,
        shouldRebuild,
        project: project.dir,
        uncompiled: loaded.uncompiled,
      },
      dependencies,
    );
    kits.push(...outcome.kits);
    uncompiled.push(...outcome.uncompiled);
    projectEntries.push({ project: project.dir, passed: outcome.passed });
  }

  const passed = projectEntries.every((entry) => entry.passed);
  yield { kind: 'verifyFinished', outcome: { kits, passed, projects: projectEntries, uncompiled } };
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

// endregion | Helpers
