import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { getLayout } from '../layout/engine.ts';
import { SEGMENT_SEPARATOR } from '../layout/layoutEngine.ts';
import type { RemoteFetchContext } from '../remote/createRemoteFetchContext.ts';
import type { JsonListKitEntry } from '../schemas/listOutputSchema.ts';
import { expandConfiguredSource, type SourceKit } from '../sources/expandConfiguredSources.ts';
import type { ConfiguredSource } from '../sources/parseConfiguredSource.ts';

/** Returns a kit row for a TypeScript source awaiting compilation, recording whether `--internal` reaches it. */
export function buildSourceEntry(name: string, dir: string, extension: string, internal: boolean): JsonListKitEntry {
  return {
    name,
    kind: 'internal',
    internal,
    path: path.relative(process.cwd(), path.join(dir, `${name}${extension}`)),
  };
}

/**
 * Builds the row for a kit published by a source, recording whether the config names that source.
 *
 * `project` names the directory whose sources were read. Pass `undefined` for a listing that reads one
 * project, and the sweep-relative directory for a repo-wide one, in which two workspaces naming the same
 * source each contribute a row. A repository kit has no path on this machine, so its row has none.
 */
export function buildSourceKitEntry(kit: SourceKit, configured: boolean, project?: string): JsonListKitEntry {
  return {
    name: kit.kitName,
    kind: 'compiled',
    ...(project !== undefined && { project }),
    origin: {
      source: kit.source,
      ...(kit.version !== undefined && { version: kit.version }),
      configured,
    },
    ...('path' in kit.location && { path: kit.location.path }),
    ...(kit.description !== undefined && { description: kit.description }),
    ...(kit.checklists !== undefined && { checklists: kit.checklists }),
    ...(kit.checklistChecks !== undefined && { checklistChecks: kit.checklistChecks }),
  };
}

/**
 * Collects the kits published by the configured sources, tolerating one that cannot be expanded.
 *
 * `run` fails hard on the same configuration, because it would otherwise execute against a source set that
 * nobody chose. Listing is read-only, so it takes the warn-and-continue that the corrupt-manifest path above
 * already takes: A reader asking what exists is better served by the rest of the answer than by none.
 */
export async function collectConfiguredSourceKits(
  sources: readonly ConfiguredSource[],
  remote: RemoteFetchContext,
): Promise<SourceKit[]> {
  const expanded = await Promise.all(
    sources.map(async (configured) => {
      try {
        return await expandConfiguredSource(configured, '.js', remote);
      } catch (error: unknown) {
        process.stderr.write(`Warning: ${describeError(error)}\n`);
        return [];
      }
    }),
  );
  return expanded.flat();
}

/**
 * Labels a source kit, its source first.
 *
 * A package kit is labelled as a run heads it. A repository kit is labelled by its source as the config spells
 * it, without the resolved ref that a run's heading adds, because that spelling is what the row's "To run" hint
 * passes to `--from`.
 *
 * The row's own token supplies the package or repository glyph; the label contains only what follows it.
 */
export function describeSourceKit(kit: SourceKit): string {
  const version = kit.version === undefined ? '' : `@${kit.version}`;
  const label = kit.provenance.kind === 'package' ? `${kit.provenance.packageName}${version}` : kit.source;
  return `${label}${SEGMENT_SEPARATOR}${getLayout().inlineGlyph('kit')}${kit.kitName}`;
}
