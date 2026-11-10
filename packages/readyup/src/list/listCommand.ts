import path from 'node:path';
import process from 'node:process';

import { EXIT_OK } from '../bin/exitCodes.ts';
import { parseSubcommandArgs } from '../bin/parseSubcommandArgs.ts';
import { usageError } from '../errors/RdyError.ts';
import { parseFromArgument } from '../kits/parseFromArgument.ts';
import { readManifest } from '../manifest/readManifest.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { type ReportedWarning, writeWarnings } from '../output/writeWarnings.ts';
import { createRemoteFetchContext, type RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { collectSourceGroups } from '../sources/collectSourceGroups.ts';
import { buildManifestEntry } from './buildManifestEntry.ts';
import { collectSourceKits } from './collectSourceKits.ts';
import { formatConsumerView, formatManifestView, formatSourcesView } from './formatList.ts';
import { buildListOutput, type ListResult, loadListingConfig } from './list-output.ts';
import { runRecursiveMode, runRecursiveSourcesMode } from './list-recursive.ts';
import { runOwnerMode } from './runOwnerMode.ts';
import { buildSourceKitEntry } from './source-kit-entries.ts';

const listOptions = {
  checks: { type: 'boolean' },
  config: { type: 'string' },
  from: { type: 'string' },
  json: { type: 'boolean' },
  manifest: { type: 'string' },
  'no-cache': { type: 'boolean' },
  recursive: { type: 'boolean' },
  sources: { type: 'boolean' },
} as const;

/**
 * Runs the `list` subcommand: writes the warnings of the selected listing, then its human view, then its `--json`
 * document, and returns the exit code.
 *
 * The warnings are written even when the listing throws, so that a warning raised before the failure precedes the
 * error that the entry point writes.
 */
export async function listCommand(args: string[]): Promise<number> {
  const { positionals, values } = parseSubcommandArgs({ args, command: 'list', options: listOptions });

  if (positionals.length > 0) {
    throw usageError('rdy list does not accept positional arguments.');
  }

  const configArg = values.config;
  const fromArg = values.from;
  const json = values.json === true;
  const manifestArg = values.manifest;
  const sources = values.sources === true;
  const recursive = values.recursive === true;
  const showChecks = values.checks === true;

  rejectConflictingFlags({ configArg, fromArg, manifestArg, recursive, sources });
  const noCache = values['no-cache'] === true;

  const warnings: ReportedWarning[] = [];
  let result: ListResult;
  try {
    result = await runSelectedMode(
      { configArg, fromArg, manifestArg, noCache, recursive, showChecks, sources },
      warnings,
    );
  } finally {
    writeWarnings(warnings);
  }

  writeHuman(result.view + '\n', json);
  if (json) {
    process.stdout.write(JSON.stringify(buildListOutput(result, showChecks)) + '\n');
  }
  return EXIT_OK;
}

/** The `list` flags whose combinations are constrained. */
interface ListFlagConstraints {
  configArg: string | undefined;
  fromArg: string | undefined;
  manifestArg: string | undefined;
  sources: boolean;
  recursive: boolean;
}

/** The `list` flags that select a listing and decide what it reads. */
interface ListSelection extends ListFlagConstraints {
  noCache: boolean;
  showChecks: boolean;
}

// region | Helpers

/**
 * Rejects a combination of flags naming listings that cannot be produced together, or naming a config that the
 * listing would not read.
 */
function rejectConflictingFlags({ configArg, fromArg, manifestArg, recursive, sources }: ListFlagConstraints): void {
  if (fromArg !== undefined && manifestArg !== undefined) {
    throw usageError('--from and --manifest are mutually exclusive');
  }

  // `--recursive` sweeps this tree, while the other two name a single foreign source.
  if (recursive && fromArg !== undefined) {
    throw usageError('--recursive and --from are mutually exclusive');
  }

  if (recursive && manifestArg !== undefined) {
    throw usageError('--recursive and --manifest are mutually exclusive');
  }

  // `--sources` reports this directory's dependencies and configured sources, which no foreign source has.
  if (sources && fromArg !== undefined) {
    throw usageError('--sources and --from are mutually exclusive');
  }

  if (sources && manifestArg !== undefined) {
    throw usageError('--sources and --manifest are mutually exclusive');
  }

  // A sweep reads each project's own config and a foreign source reads none, so neither has a use for `--config`.
  if (recursive && configArg !== undefined) {
    throw usageError('--recursive and --config are mutually exclusive');
  }

  if (configArg !== undefined && fromArg !== undefined) {
    throw usageError('--config and --from are mutually exclusive');
  }

  if (configArg !== undefined && manifestArg !== undefined) {
    throw usageError('--config and --manifest are mutually exclusive');
  }
}

/** Lists the kits in a `--from` source. */
async function runFromMode(fromArg: string, showChecks: boolean, noCache: boolean): Promise<ListResult> {
  const sourceKits = await collectSourceKits(parseFromArgument(fromArg), createRemoteFetchContext({ reload: noCache }));

  const view =
    sourceKits.kind === 'remote'
      ? formatManifestView({
          fromArg,
          kits: sourceKits.kits,
          manifestPath: sourceKits.manifestUrl,
          showChecks,
        })
      : formatConsumerView({
          compiledKits: sourceKits.kits.map(({ name, checklists, checklistChecks }) => ({
            name,
            checklists,
            checklistChecks,
          })),
          fromArg,
          kitsDir: path.relative(process.cwd(), sourceKits.kitsDir) || '.',
          showChecks,
        });

  return { view, kits: sourceKits.kits };
}

/** Lists the kits declared by a manifest file. */
function runManifestMode(manifestArg: string, showChecks: boolean): ListResult {
  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const manifest = readManifest(manifestPath);

  const relPath = path.relative(process.cwd(), manifestPath);
  return {
    view: formatManifestView({ kits: manifest.kits, manifestPath: relPath, showChecks }),
    kits: manifest.kits.map((kit) => buildManifestEntry(kit, path.dirname(manifestPath))),
  };
}

/** Runs the listing that the flags select, adding the warnings that it raises to `warnings`. */
async function runSelectedMode(selection: ListSelection, warnings: ReportedWarning[]): Promise<ListResult> {
  const { configArg, fromArg, manifestArg, noCache, recursive, showChecks, sources } = selection;

  // The pair composes rather than conflicting: locality from one flag, provenance from the other.
  if (sources && recursive) {
    return runRecursiveSourcesMode(showChecks, createRemoteFetchContext({ reload: noCache }), warnings);
  }

  if (recursive) {
    return runRecursiveMode(showChecks, warnings);
  }

  if (manifestArg !== undefined) {
    return runManifestMode(manifestArg, showChecks);
  }

  if (fromArg !== undefined) {
    return runFromMode(fromArg, showChecks, noCache);
  }

  if (sources) {
    return runSourcesMode(showChecks, configArg, createRemoteFetchContext({ reload: noCache }), warnings);
  }

  return runOwnerMode(showChecks, configArg, createRemoteFetchContext({ reload: noCache }), warnings);
}

/**
 * Enumerates every kit source available to the working directory, with the kits that each publishes.
 *
 * The dependency axis alone: A project's own kits belong to the owner listing, and this view reports what
 * the project's sources offer rather than what it contains. Both the packages named by the config and the
 * ones that it omits are reported, since the question is what is available rather than what a run would select,
 * and so is every repository that the config names.
 */
async function runSourcesMode(
  showChecks: boolean,
  configPath: string | undefined,
  remote: RemoteFetchContext,
  warnings: ReportedWarning[],
): Promise<ListResult> {
  const { config, warnings: configWarnings } = await loadListingConfig(configPath);
  warnings.push(...configWarnings);
  const { groups, warnings: sourceWarnings } = await collectSourceGroups({
    configuredSources: config.sources,
    fromDir: process.cwd(),
    remote,
  });
  warnings.push(...sourceWarnings);

  return {
    view: formatSourcesView({ groups, showChecks }),
    kits: groups.flatMap((group) => group.kits.map((kit) => buildSourceKitEntry(kit, group.configured))),
  };
}

// endregion | Helpers
