import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { pluralizeWithCount } from '@williamthorsen/toolbelt.strings';

import { RdyError } from '../errors/RdyError.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { discoverKitProjects, type Project } from '../projects/project-discovery.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import type {
  JsonCompileKitEntry,
  JsonCompileProjectEntry,
  JsonCompileRemovedEntry,
} from '../schemas/compileOutputSchema.ts';
import { finishCompile, type ProjectCompileOutcome } from './compile-outcome.ts';
import { compileProject } from './compileProject.ts';

/** Arguments for the recursive compile path. */
export interface CompileRecursiveArgs {
  force: boolean;
  skipManifest: boolean;
  json: boolean;
}

/**
 * Compiles the kits of every kit project below the working directory, each as `rdy compile` run from its directory would.
 *
 * The sweep runs to completion across projects as it does across kits: A project that cannot be compiled at
 * all is reported, the next project is tried, and the run fails. A project whose config cannot be evaluated
 * is one of those, and is never compiled under the defaults that discovery read it with.
 */
export async function compileRecursive(args: CompileRecursiveArgs): Promise<number> {
  const { force, skipManifest, json } = args;
  const root = process.cwd();
  const projects = await discoverKitProjects({ root });

  if (projects.length === 0) {
    writeHuman('No kit projects found.\n', json);
    return finishCompile({ kits: [], projects: [], removed: [], warnings: [] }, json);
  }

  const kits: JsonCompileKitEntry[] = [];
  const projectEntries: JsonCompileProjectEntry[] = [];
  const removed: JsonCompileRemovedEntry[] = [];
  const warnings: RaisedWarning[] = [];
  let hasWrittenBlock = false;

  for (const project of projects) {
    if (project.configError !== undefined) {
      projectEntries.push(reportProjectFailure(project.dir, describeError(project.configError)));
      continue;
    }

    // No block is written for a project that fails on its config, so separation follows the blocks actually written.
    if (hasWrittenBlock) writeHuman('\n', json);
    hasWrittenBlock = true;

    const outcome = await compileSweptProject(project, { root, force, skipManifest, json });
    kits.push(...outcome.kits);
    projectEntries.push(outcome.entry);
    removed.push(...outcome.removed);
    warnings.push(...outcome.warnings);
  }

  const failedDirs = projectEntries.filter((entry) => !entry.passed).map((entry) => entry.project);
  if (failedDirs.length > 0) {
    writeHuman(
      `\nProblems in ${failedDirs.length} of ${pluralizeWithCount(projects.length, 'project')}: ${failedDirs.join(', ')}\n`,
      json,
    );
  }

  return finishCompile({ kits, projects: projectEntries, removed, warnings }, json);
}

// region | Helpers

/** Arguments shared by every project that a recursive compile visits. */
interface CompileSweptProjectArgs {
  root: string;
  force: boolean;
  skipManifest: boolean;
  json: boolean;
}

/** One project's contribution to a recursive compile. */
interface SweptProjectOutcome extends ProjectCompileOutcome {
  entry: JsonCompileProjectEntry;
}

/**
 * Compiles one discovered project, reporting a failure that stops the project rather than letting it end the sweep.
 *
 * Only an `RdyError` is a project failure. Anything else is a defect in rdy, and ends the run.
 */
async function compileSweptProject(project: Project, args: CompileSweptProjectArgs): Promise<SweptProjectOutcome> {
  const { root, force, skipManifest, json } = args;

  try {
    const outcome = await compileProject({
      projectDir: project.absolutePath,
      config: project.config,
      manifestPath: project.manifestPath,
      force,
      skipManifest,
      json,
      sweep: { root, project: project.dir },
    });
    return {
      ...outcome,
      entry: { project: project.dir, passed: outcome.kits.every((kit) => kit.status === 'compiled') },
    };
  } catch (error: unknown) {
    if (!(error instanceof RdyError)) throw error;
    return { kits: [], entry: reportProjectFailure(project.dir, error.message), removed: [], warnings: [] };
  }
}

/** Writes the failure of a project that could not be compiled at all, and returns the project's entry. */
function reportProjectFailure(dir: string, message: string): JsonCompileProjectEntry {
  process.stderr.write(`Error in ${dir}: ${message}\n`);
  return { project: dir, passed: false, error: message };
}

// endregion | Helpers
