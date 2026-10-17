import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { discoverKitPackages } from '../check-utils/discoverKitPackages.ts';
import { collectSourceKitNames } from '../compile/collectSourceKitNames.ts';
import { configError } from '../errors/RdyError.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import { writeHuman } from '../output/writeHuman.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import type { JsonListKitEntry } from '../schemas/listOutputSchema.ts';
import { collectCompiledKits } from './collectCompiledKits.ts';
import { enumerateKits } from './enumerateKits.ts';
import { formatOwnerView } from './formatList.ts';
import { finishList, type ListOutputOptions, loadListingConfig, warnOfUnreadableManifest } from './list-output.ts';
import {
  buildSourceEntry,
  buildSourceKitEntry,
  collectConfiguredSourceKits,
  describeSourceKit,
} from './source-kit-entries.ts';

/** Enumerates the kits named by the project config. */
export async function runOwnerMode(
  output: ListOutputOptions,
  configPath: string | undefined,
  remote: RemoteFetchContext,
): Promise<number> {
  const cwd = process.cwd();
  const config = await loadListingConfig(configPath);

  const srcDir = path.resolve(cwd, config.compile.srcDir);
  const internalDir = path.join(srcDir, config.internal.dir);
  const internalExtension = config.internal.infix !== undefined ? `.${config.internal.infix}.ts` : '.ts';
  // Without either key `--internal` resolves a name exactly as plain `--jit` does, so the bucket is the
  // source selection and rows for it would restate the source rows.
  const needsInternalFlag = config.internal.dir !== '.' || config.internal.infix !== undefined;

  let sourceKits;
  let internalKits;
  let compiledEntries;
  try {
    sourceKits = collectSourceKitNames(srcDir, config.compile);
    internalKits = needsInternalFlag
      ? enumerateKits({ dir: internalDir, extension: internalExtension, recursive: false })
      : [];
    // A missing manifest is the normal state of a project that never compiled, and says nothing on its own: The
    // empty-listing hint belongs to the view, which sees the package sections too.
    compiledEntries = collectCompiledKits({
      manifestPath: path.resolve(cwd, DEFAULT_MANIFEST_PATH),
      onUnreadableManifest: warnOfUnreadableManifest,
      outDir: path.resolve(cwd, config.compile.outDir),
    });
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }

  const configuredKits = await collectConfiguredSourceKits(config.sources, remote);
  const configuredSpellings = new Set(config.sources.map((configured) => configured.spelling));
  const availableSources = discoverKitPackages(cwd)
    .map((name) => `npm:${name}`)
    .filter((spelling) => !configuredSpellings.has(spelling) && !config.omittedSources.includes(spelling));

  const compiledKits = compiledEntries.map(({ name, checklists, checklistChecks }) => ({
    name,
    checklists,
    checklistChecks,
  }));
  writeHuman(
    formatOwnerView({
      sourceKits,
      internalKits,
      compiledKits,
      configuredKits: configuredKits.map((kit) => ({
        name: describeSourceKit(kit),
        checklists: kit.checklists,
        checklistChecks: kit.checklistChecks,
        sourceKind: kit.provenance.kind === 'repository' ? 'repository' : 'package',
      })),
      availableSources,
      showChecks: output.showChecks,
    }) + '\n',
    output.json,
  );

  const entries: JsonListKitEntry[] = [
    ...sourceKits.map((name) => buildSourceEntry(name, srcDir, '.ts', false)),
    ...internalKits.map((name) => buildSourceEntry(name, internalDir, internalExtension, true)),
    ...compiledEntries,
    ...configuredKits.map((kit) => buildSourceKitEntry(kit, true)),
  ];
  return finishList(entries, output, availableSources);
}
