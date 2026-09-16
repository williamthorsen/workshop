import path from 'node:path';
import process from 'node:process';

import { enumerateKits } from '../list/enumerateKits.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import type { RaisedWarning } from '../schemas/common.ts';

/** Arguments for warning on the bundles of a sweep that nothing accounts for. */
export interface WarnOnUnrecordedBundlesArgs {
  /** The entries of the manifest that the sweep writes. */
  entries: RdyManifestKit[];
  manifestDir: string;
  /** Absolute path of the directory into which the sweep compiles. */
  outDir: string;
  /** The name of every kit whose source the sweep attempted, whatever became of it. */
  sweptKitNames: ReadonlySet<string>;
}

/**
 * Warns on each bundle directly under `outDir` that neither a swept source nor a manifest entry accounts for, and
 * returns one warning per bundle.
 *
 * Nothing shows that a compile wrote such a bundle, so it is reported rather than deleted. A bundle named for a swept
 * kit is accounted for whatever became of that kit, because the bundle left by a failed compile still has its source.
 * The candidates are the files that `rdy run` and `rdy list` treat as kits: every bundle below `outDir` that is not hidden.
 *
 * The stderr line is written in both output modes; the returned entries are what JSON mode adds to the payload.
 */
export function warnOnUnrecordedBundles(args: WarnOnUnrecordedBundlesArgs): RaisedWarning[] {
  const { entries, manifestDir, outDir, sweptKitNames } = args;
  const recordedPaths = new Set(
    entries.flatMap((entry) => (entry.path === undefined ? [] : [path.resolve(manifestDir, entry.path)])),
  );
  const displayDir = path.relative(process.cwd(), outDir) || '.';

  const warnings: RaisedWarning[] = [];
  const bundleNames = enumerateKits({ dir: outDir, extension: '.js', recursive: true });
  for (const name of bundleNames) {
    if (sweptKitNames.has(name) || recordedPaths.has(path.join(outDir, `${name}.js`))) continue;

    const warning: RaisedWarning = {
      code: 'bundle-unrecorded',
      message: `${name}.js in ${displayDir} is not recorded in the manifest, and no source compiles to it.`,
      remedy: 'Delete it if its kit was removed.',
    };
    process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
    warnings.push(warning);
  }
  return warnings;
}
