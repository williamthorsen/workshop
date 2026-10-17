import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { usageError } from '../errors/RdyError.ts';
import { parseFromValue } from '../kits/parseFromValue.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { createRemoteFetchContext, type RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import { collectSourceGroups } from '../sources/collectSourceGroups.ts';
import { buildManifestEntry } from './buildManifestEntry.ts';
import { collectSourceKits } from './collectSourceKits.ts';
import { formatConsumerView, formatManifestView, formatSourcesView } from './formatList.ts';
import { finishList, type ListOutputOptions, loadListingConfig, readManifestOrThrow } from './list-output.ts';
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
  // Declared so that strict parsing accepts it; `routeCommand` consumed its value before dispatch.
  style: { type: 'string' },
} as const;

/** Runs the `list` subcommand, returning the exit code produced by its enumeration of manifest and filesystem kits. */
export async function listCommand(args: string[]): Promise<number> {
  let parsed;
  try {
    parsed = nodeParseArgs({ args, options: listOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error, 'list'), { cause: error });
  }
  const { positionals, values } = parsed;

  if (positionals.length > 0) {
    throw usageError('rdy list does not accept positional arguments.');
  }

  for (const [name, value] of Object.entries(values)) {
    if (value === '') {
      throw usageError(`--${name} requires a value`);
    }
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

  // The pair composes rather than conflicting: locality from one flag, provenance from the other.
  if (sources && recursive) {
    return runRecursiveSourcesMode({ json, showChecks }, createRemoteFetchContext({ reload: noCache }));
  }

  if (recursive) {
    return runRecursiveMode({ json, showChecks });
  }

  if (manifestArg !== undefined) {
    return runManifestMode(manifestArg, { json, showChecks });
  }

  if (fromArg !== undefined) {
    return runFromMode(fromArg, { json, showChecks }, noCache);
  }

  if (sources) {
    return runSourcesMode({ json, showChecks }, configArg, createRemoteFetchContext({ reload: noCache }));
  }

  return runOwnerMode({ json, showChecks }, configArg, createRemoteFetchContext({ reload: noCache }));
}

/** The `list` flags whose combinations are constrained. */
interface ListFlagConstraints {
  configArg: string | undefined;
  fromArg: string | undefined;
  manifestArg: string | undefined;
  sources: boolean;
  recursive: boolean;
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

/** Displays the kits in a `--from` source. */
async function runFromMode(fromArg: string, output: ListOutputOptions, noCache: boolean): Promise<number> {
  let source;
  try {
    source = parseFromValue(fromArg);
  } catch (error: unknown) {
    throw usageError(describeError(error), { cause: error });
  }

  const sourceKits = await collectSourceKits(source, createRemoteFetchContext({ reload: noCache }));

  const view =
    sourceKits.kind === 'remote'
      ? formatManifestView({
          fromArg,
          kits: sourceKits.kits,
          manifestPath: sourceKits.manifestUrl,
          showChecks: output.showChecks,
        })
      : formatConsumerView({
          compiledKits: sourceKits.kits.map(({ name, checklists, checklistChecks }) => ({
            name,
            checklists,
            checklistChecks,
          })),
          fromArg,
          kitsDir: path.relative(process.cwd(), sourceKits.kitsDir) || '.',
          showChecks: output.showChecks,
        });
  writeHuman(view + '\n', output.json);

  return finishList(sourceKits.kits, output);
}

/** Displays the kits declared by a manifest file. */
function runManifestMode(manifestArg: string, output: ListOutputOptions): number {
  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const manifest = readManifestOrThrow(manifestPath);

  const relPath = path.relative(process.cwd(), manifestPath);
  writeHuman(
    formatManifestView({ kits: manifest.kits, manifestPath: relPath, showChecks: output.showChecks }) + '\n',
    output.json,
  );

  return finishList(
    manifest.kits.map((kit) => buildManifestEntry(kit, path.dirname(manifestPath))),
    output,
  );
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
  output: ListOutputOptions,
  configPath: string | undefined,
  remote: RemoteFetchContext,
): Promise<number> {
  const config = await loadListingConfig(configPath);
  const groups = await collectSourceGroups({ configuredSources: config.sources, fromDir: process.cwd(), remote });

  writeHuman(formatSourcesView({ groups, showChecks: output.showChecks }) + '\n', output.json);

  return finishList(
    groups.flatMap((group) => group.kits.map((kit) => buildSourceKitEntry(kit, group.configured))),
    output,
  );
}

// endregion | Helpers
