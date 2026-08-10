import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { buildBundle } from '../compile/buildBundle.ts';
import { extractMessage } from '../errors/error-handling.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { VERSION } from '../version.ts';
import { hashBytes } from './targetHash.ts';

/** Outcome of a per-kit rebuild check. */
export type RebuildStatus =
  | { kind: 'ok' }
  | { kind: 'mismatch'; expected: string; actual: string; compiledWith?: string }
  | { kind: 'failed'; message: string }
  | { kind: 'missing'; reason: string };

/**
 * Determines whether recompiling a kit's source reproduces the compiled bundle on disk.
 *
 * Answers exactly the question the two hash verdicts approximate. `targetHash` and `sourceHash`
 * record two of the bundle's inputs, but a bundle is a function of every module it inlines, every
 * JSON file `pickJson` reads, the esbuild version, and the compile options -- none of which the
 * manifest records. Recompiling reads all of them.
 *
 * Compares against the on-disk bytes and never against `targetHash`, so the verdict is independent
 * of the manifest's bookkeeping and can contradict it. A kit whose recorded hash has gone wrong
 * reports drift and a passing rebuild together, which is how the two verdicts distinguish a corrupt
 * bundle from corrupt bookkeeping.
 *
 * Every way the check can fail to reach an answer is reported rather than waved through: `missing`
 * when an input is absent, `failed` when the source no longer compiles. `failed` is distinct from
 * `mismatch` because the remedy differs -- fix the kit, versus recompile it.
 */
export async function checkRebuild(kit: RdyManifestKit, manifestDir: string): Promise<RebuildStatus> {
  if (kit.source === undefined) {
    return { kind: 'missing', reason: 'no source recorded in manifest' };
  }

  if (kit.path === undefined) {
    return { kind: 'missing', reason: 'no compiled path recorded in manifest' };
  }

  const sourcePath = path.resolve(manifestDir, kit.source);
  if (!existsSync(sourcePath)) {
    return { kind: 'missing', reason: `source file ${kit.source} is gone` };
  }

  const targetPath = path.resolve(manifestDir, kit.path);
  if (!existsSync(targetPath)) {
    return { kind: 'missing', reason: `compiled file ${kit.path} is gone` };
  }

  let rebuilt: Buffer;
  try {
    rebuilt = await buildBundle(sourcePath);
  } catch (error: unknown) {
    // A source that no longer compiles is a finding about the kit, not a failure of the invocation,
    // so the sweep carries on to the kits after it.
    return { kind: 'failed', message: extractMessage(error) };
  }

  const onDisk = readFileSync(targetPath);
  if (rebuilt.equals(onDisk)) {
    return { kind: 'ok' };
  }

  // The generated banner embeds the compiling readyup's version, so a version move alone makes an
  // untouched source rebuild to different bytes. Carry the recorded version to keep that cause
  // distinguishable from a hand edit.
  const compiledWith = kit.readyupVersion !== VERSION ? kit.readyupVersion : undefined;

  return {
    kind: 'mismatch',
    expected: hashBytes(rebuilt),
    actual: hashBytes(onDisk),
    ...(compiledWith !== undefined && { compiledWith }),
  };
}
