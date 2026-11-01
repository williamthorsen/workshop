import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { finished } from 'node:stream/promises';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { SourceState } from '../clients/git/read-source-state.ts';
import { buildProvenance, type FileDigest } from './build-provenance.ts';
import { formatTakeDirName } from './format-take-dir-name.ts';
import type { ResolvedVoice } from './resolve-voice.ts';

/** Everything needed to archive a take once aidemo has rendered it, captured before the render started. */
export interface TakeArchivePlan {
  readonly aidemoVersion: string;
  readonly archiveRoot: string;
  readonly demo: string;
  /** The demo's absolute directory, whose `output/` holds the rendered take. */
  readonly demoDir: string;
  readonly label: string;
  readonly params: readonly string[];
  /** The checksum of the reference recording, for a take narrated in a cloned voice. */
  readonly reference?: { readonly sha256: string };
  readonly renderedAt: Date;
  readonly source: SourceState | undefined;
  readonly storyboardSha256: string;
  readonly voice: ResolvedVoice;
}

/** The outcome of archiving a take: the take's directory, or what stopped it. */
export type ArchiveOutcome = { ok: true; takeDir: string } | { ok: false; message: string };

/** The rendered video, which every take contains. */
export const VIDEO_FILE = 'final-demo.mp4';

/** The files that a take contains when aidemo wrote them. */
export const OPTIONAL_FILES: readonly string[] = ['final-demo.srt', 'final-demo.vtt', 'report.json'];

/** The provenance record's file name in a take. */
export const PROVENANCE_FILE = 'provenance.json';

/**
 * Copies the take in the demo's `output/` to `<archiveRoot>/<label>/<demo>/<take>/` with its provenance record. The
 * take is assembled in a staging directory beside its final location and renamed into place, so that a failure
 * leaves no partial take. `output/` is only read.
 */
export async function archiveTake(plan: TakeArchivePlan): Promise<ArchiveOutcome> {
  const parentDir = path.join(plan.archiveRoot, plan.label, plan.demo);
  const takeName = formatTakeDirName(plan.renderedAt, plan.source);
  const takeDir = path.join(parentDir, takeName);
  if (existsSync(takeDir)) return { ok: false, message: `${takeDir} already exists` };

  const outputDir = path.join(plan.demoDir, 'output');
  if (!existsSync(path.join(outputDir, VIDEO_FILE))) {
    return { ok: false, message: `${path.join(outputDir, VIDEO_FILE)} not found` };
  }
  const fileNames = [VIDEO_FILE, ...OPTIONAL_FILES.filter((name) => existsSync(path.join(outputDir, name)))];

  const stagingDir = path.join(parentDir, `.${takeName}.partial-${String(process.pid)}`);
  try {
    await mkdir(stagingDir, { recursive: true });

    const files: Record<string, FileDigest> = {};
    for (const name of fileNames) {
      const destination = path.join(stagingDir, name);
      await copyFile(path.join(outputDir, name), destination);
      files[name] = await digestFile(destination);
    }

    const provenance = buildProvenance({ ...plan, files });
    await writeFile(path.join(stagingDir, PROVENANCE_FILE), `${JSON.stringify(provenance, null, 2)}\n`);
    await rename(stagingDir, takeDir);
  } catch (error) {
    await rm(stagingDir, { force: true, recursive: true });
    return { ok: false, message: `cannot archive to ${takeDir}: ${describeError(error)}` };
  }

  return { ok: true, takeDir };
}

/** Returns the sha256 and size of a file. */
export async function digestFile(filePath: string): Promise<FileDigest> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  await finished(stream);

  return { bytes: (await stat(filePath)).size, sha256: hash.digest('hex') };
}
