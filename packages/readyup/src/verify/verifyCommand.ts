import path from 'node:path';
import process from 'node:process';

import { EXIT_OK, EXIT_PROBLEMS_FOUND } from '../bin/exitCodes.ts';
import { parseSubcommandArgs } from '../bin/parseSubcommandArgs.ts';
import { usageError } from '../errors/RdyError.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import { writeError } from '../output/writeError.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { writeWarnings } from '../output/writeWarnings.ts';
import type { VerifyEvent, VerifyOutcome } from './verify-events.ts';
import {
  defaultVerifyDependencies,
  findUncompiledKits,
  loadManifest,
  loadVerifyConfig,
  requireEsbuild,
  resolveManifestProjectDir,
  type VerifyDependencies,
  verifySingleManifest,
} from './verify-manifest.ts';
import {
  buildVerifyOutput,
  formatKitsFailedSummary,
  formatManifestHeading,
  formatProjectsSummary,
  formatStatusLine,
  formatUncompiledLine,
} from './verify-report.ts';
import { verifyRecursive } from './verifyRecursive.ts';

const verifyOptions = {
  config: { type: 'string' },
  json: { type: 'boolean' },
  manifest: { type: 'string' },
  rebuild: { type: 'boolean' },
  recursive: { type: 'boolean' },
} as const;

/**
 * Handles the `verify` subcommand: reads the manifest, hashes each kit's source and compiled
 * output, and reports what no longer matches, along with each kit source selected by the compile
 * settings that the manifest does not record. Under `--recursive`, does so for every kit project
 * below the working directory.
 *
 * Each kit has three independent verdicts, and a fourth under `--rebuild`. Returns 0 when every
 * verdict is `ok` or `unverified` and every selected source is recorded; 1 when any kit has drifted,
 * gone stale, lost a file, failed to reproduce, or was never compiled, and under `--recursive` also
 * when any project cannot be verified. An unreadable manifest, config, or source directory outside a
 * sweep is a config failure and is thrown rather than reported as drift, as is a `--rebuild` run with
 * no esbuild to rebuild with.
 */
export async function verifyCommand(
  args: string[],
  dependencies: VerifyDependencies = defaultVerifyDependencies,
): Promise<number> {
  const { values, positionals } = parseSubcommandArgs({ args, command: 'verify', options: verifyOptions });

  if (positionals.length > 0) {
    throw usageError('rdy verify does not accept positional arguments.');
  }

  const isJson = values.json === true;
  const shouldRebuild = values.rebuild === true;
  const recursive = values.recursive === true;

  // `--recursive` verifies each project's own manifest, so there is no single manifest for `--manifest` to name.
  if (recursive && values.manifest !== undefined) {
    throw usageError('--recursive and --manifest are mutually exclusive');
  }

  // `--recursive` reads each project's own config, so there is no single config for `--config` to name.
  if (recursive && values.config !== undefined) {
    throw usageError('--recursive and --config are mutually exclusive');
  }

  // Settle the bundler's availability before the run says anything. An exactness check that reports
  // kit after kit and then discovers it could never have run reads as a partial result; raised here,
  // the error reports an absent esbuild as a problem with the environment, not with any kit.
  if (shouldRebuild) await requireEsbuild(dependencies);

  if (recursive) {
    return toExitCode(await writeVerifyEvents(verifyRecursive({ shouldRebuild }, dependencies), isJson));
  }

  const manifestPath = path.resolve(process.cwd(), values.manifest ?? DEFAULT_MANIFEST_PATH);
  const manifest = loadManifest(manifestPath, values.manifest, dependencies);
  const projectDir = resolveManifestProjectDir(manifestPath);
  const config = await loadVerifyConfig(projectDir, values.config, dependencies);
  const uncompiled = findUncompiledKits({
    manifest,
    manifestDir: path.dirname(manifestPath),
    srcDir: path.resolve(projectDir, config.compile.srcDir),
    selection: config.compile,
  });
  const events = verifySingleManifest({ manifest, manifestPath, shouldRebuild, uncompiled }, dependencies);
  return toExitCode(await writeVerifyEvents(events, isJson));
}

// region | Helpers
/** Turns a run's verdict into its exit code. */
function toExitCode(outcome: VerifyOutcome): number {
  return outcome.passed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/** Writes what closes a recursive verify: a note when it found no projects, or the list of projects that failed. */
function writeProjectsClosing(projects: NonNullable<VerifyOutcome['projects']>, isJson: boolean): void {
  if (projects.length === 0) {
    writeHuman('No kit projects found.\n', isJson);
    return;
  }

  const failedDirs = projects.filter((entry) => !entry.passed).map((entry) => entry.project);
  if (failedDirs.length > 0) writeHuman(formatProjectsSummary(failedDirs, projects.length), isJson);
}

/**
 * Writes each event of a verify run as it arrives, and returns the outcome of the run's `verifyFinished` event.
 *
 * Human text goes to stdout, or to stderr under `--json`, which reserves stdout for the one JSON document written
 * once the run finishes.
 */
async function writeVerifyEvents(events: AsyncGenerator<VerifyEvent>, isJson: boolean): Promise<VerifyOutcome> {
  let hasWrittenBlock = false;
  for await (const event of events) {
    switch (event.kind) {
      case 'discoveryFinished':
        writeWarnings(event.warnings);
        break;

      case 'manifestStarted':
        // A project that fails before verifying writes no block, so separation follows the blocks actually written.
        if (hasWrittenBlock) writeHuman('\n', isJson);
        hasWrittenBlock = true;
        writeHuman(formatManifestHeading(event.manifestPath), isJson);
        if (event.kitCount === 0) writeHuman('(no kits in manifest)\n', isJson);
        break;

      case 'kitVerified':
        writeHuman(formatStatusLine(event.kit, event.verdicts), isJson);
        break;

      case 'manifestFinished':
        for (const entry of event.uncompiled) {
          writeHuman(formatUncompiledLine(entry), isJson);
        }
        if (event.failedCount > 0) writeHuman(formatKitsFailedSummary(event.failedCount, event.totalCount), isJson);
        break;

      case 'projectFailed':
        writeError(event.message, event.project);
        break;

      case 'verifyFinished': {
        const { outcome } = event;
        if (outcome.projects !== undefined) writeProjectsClosing(outcome.projects, isJson);
        if (isJson) process.stdout.write(JSON.stringify(buildVerifyOutput(outcome)) + '\n');
        return outcome;
      }

      default:
        event satisfies never;
    }
  }

  throw new Error('rdy verify ended without a verifyFinished event');
}
// endregion | Helpers
