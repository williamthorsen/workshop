import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { pluralizeWithCount } from '@williamthorsen/toolbelt.strings';

import { extractHint } from '../errors/extractHint.ts';
import { RdyError } from '../errors/RdyError.ts';
import { writeError } from '../output/writeError.ts';
import { writeHint } from '../output/writeHint.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { type ReportedWarning, writeWarnings } from '../output/writeWarnings.ts';
import { discoverKitProjects, type Project } from '../projects/project-discovery.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import type {
  JsonCompileKitEntry,
  JsonCompileProjectEntry,
  JsonCompileRemovedEntry,
} from '../schemas/compileOutputSchema.ts';
import { finishCompile, type ProjectCompileOutcome } from './compile-outcome.ts';
import { compileProject } from './compileProject.ts';

/**
 * Compiles the kits of every kit project below the working directory, each as `rdy compile` run from its directory would.
 *
 * The sweep runs to completion across projects as it does across kits: A project that cannot be compiled at
 * all is reported, the next project is tried, and the run fails. A project whose config cannot be evaluated
 * is one of those, and is never compiled under the defaults that discovery read it with.
 */
export async function compileRecursive(args: CompileRecursiveArgs): Promise<number> {
  const { shouldForce, shouldSkipManifest, isJson } = args;
  const root = process.cwd();
  const discoveryWarnings: ReportedWarning[] = [];
  let projects: Project[];
  try {
    projects = await discoverKitProjects({ root }, discoveryWarnings);
  } finally {
    // Write the warnings raised before a failure too, so that they precede its error.
    writeWarnings(discoveryWarnings);
  }

  if (projects.length === 0) {
    writeHuman('No kit projects found.\n', isJson);
    return finishCompile({ kits: [], projects: [], removed: [], warnings: [] }, isJson);
  }

  const kits: JsonCompileKitEntry[] = [];
  const projectEntries: JsonCompileProjectEntry[] = [];
  const removed: JsonCompileRemovedEntry[] = [];
  const warnings: RaisedWarning[] = [];
  let hasWrittenBlock = false;

  for (const project of projects) {
    if (project.configError !== undefined) {
      projectEntries.push(reportProjectFailure(project.dir, project.configError));
      continue;
    }

    // No block is written for a project that fails on its config, so separation follows the blocks actually written.
    if (hasWrittenBlock) writeHuman('\n', isJson);
    hasWrittenBlock = true;

    const outcome = await compileSweptProject(project, { root, shouldForce, shouldSkipManifest, isJson });
    kits.push(...outcome.kits);
    projectEntries.push(outcome.entry);
    removed.push(...outcome.removed);
    warnings.push(...outcome.warnings);
  }

  const failedDirs = projectEntries.filter((entry) => !entry.passed).map((entry) => entry.project);
  if (failedDirs.length > 0) {
    writeHuman(
      `\nProblems in ${failedDirs.length} of ${pluralizeWithCount(projects.length, 'project')}: ${failedDirs.join(', ')}\n`,
      isJson,
    );
  }

  return finishCompile({ kits, projects: projectEntries, removed, warnings }, isJson);
}

/** Arguments for the recursive compile path. */
export interface CompileRecursiveArgs {
  shouldForce: boolean;
  shouldSkipManifest: boolean;
  isJson: boolean;
}

// region | Helpers

/**
 * Compiles one discovered project, reporting a failure that stops the project rather than letting it end the sweep.
 *
 * Only an `RdyError` is a project failure. Anything else is a defect in rdy, and ends the run.
 */
async function compileSweptProject(project: Project, args: CompileSweptProjectArgs): Promise<SweptProjectOutcome> {
  const { root, shouldForce, shouldSkipManifest, isJson } = args;

  try {
    const outcome = await compileProject({
      projectDir: project.absolutePath,
      config: project.config,
      manifestPath: project.manifestPath,
      shouldForce,
      shouldSkipManifest,
      isJson,
      sweep: { root, project: project.dir },
    });
    return {
      ...outcome,
      entry: { project: project.dir, passed: outcome.kits.every((kit) => kit.status === 'compiled') },
    };
  } catch (error: unknown) {
    if (!(error instanceof RdyError)) throw error;
    return { kits: [], entry: reportProjectFailure(project.dir, error), removed: [], warnings: [] };
  }
}

/** Arguments shared by every project that a recursive compile visits. */
interface CompileSweptProjectArgs {
  root: string;
  shouldForce: boolean;
  shouldSkipManifest: boolean;
  isJson: boolean;
}

/** Writes the failure of a project that could not be compiled at all, with its hint, and returns the project's entry. */
function reportProjectFailure(dir: string, error: Error): JsonCompileProjectEntry {
  const message = describeError(error);
  writeError(message, dir);
  writeHint(extractHint(error));
  return { project: dir, passed: false, error: message };
}

/** One project's contribution to a recursive compile. */
interface SweptProjectOutcome extends ProjectCompileOutcome {
  entry: JsonCompileProjectEntry;
}

// endregion | Helpers
