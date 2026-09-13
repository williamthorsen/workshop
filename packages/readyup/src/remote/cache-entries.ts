import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { computeHash } from '../check-utils/hashing.ts';
import { safeJsonParse } from '../portable/safeJsonParse.ts';

/** Schema for a stored response: what freshness and revalidation read, and the body served in place of a fetch. */
const CacheEntrySchema = z.object({
  ageSec: z.number(),
  body: z.string(),
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  maxAgeSec: z.number().optional(),
  noCache: z.boolean(),
  storedAtMs: z.number(),
  url: z.string(),
  version: z.literal(1),
});

/** A response stored for a URL. */
export type CacheEntry = z.infer<typeof CacheEntrySchema>;

/** Reads the entry stored for a URL, or `undefined` where nothing readable is stored for that URL. */
export async function readCacheEntry(cacheDir: string, url: string): Promise<CacheEntry | undefined> {
  let text: string;
  try {
    text = await readFile(resolveEntryPath(cacheDir, url), 'utf8');
  } catch {
    return undefined;
  }

  const result = CacheEntrySchema.safeParse(safeJsonParse(text));
  return result.success && result.data.url === url ? result.data : undefined;
}

/** Removes the entry stored for a URL, doing nothing where there is none or it cannot be removed. */
export async function removeCacheEntry(cacheDir: string, url: string): Promise<void> {
  await removeFile(resolveEntryPath(cacheDir, url));
}

/**
 * Stores an entry for its URL, replacing any entry already stored.
 *
 * The entry is written beside its target and renamed over it, so a concurrent reader sees the old entry or the new
 * one and never part of either. A write that fails stores nothing: The cache saves requests, and a run does not
 * depend on it.
 */
export async function writeCacheEntry(cacheDir: string, entry: CacheEntry): Promise<void> {
  const entryPath = resolveEntryPath(cacheDir, entry.url);
  const tempPath = `${entryPath}.${randomUUID()}.tmp`;

  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(tempPath, JSON.stringify(entry), 'utf8');
    await rename(tempPath, entryPath);
  } catch {
    await removeFile(tempPath);
  }
}

// region | Helpers

/** Removes a file, doing nothing where it is absent or cannot be removed. */
async function removeFile(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true });
  } catch {
    // A leftover temp file is never read, and a leftover entry is served no longer than its server allowed.
  }
}

/** Returns the path of the file storing a URL's entry. */
function resolveEntryPath(cacheDir: string, url: string): string {
  return path.join(cacheDir, `${computeHash(url)}.json`);
}

// endregion | Helpers
