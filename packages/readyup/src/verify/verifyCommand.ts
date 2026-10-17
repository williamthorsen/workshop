import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { usageError } from '../errors/RdyError.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import {
  findUncompiledKits,
  finishVerify,
  loadManifest,
  loadVerifyConfig,
  requireEsbuild,
  resolveManifestProjectDir,
  verifyManifest,
} from './verify-manifest.ts';
import { verifyRecursive } from './verifyRecursive.ts';

const verifyOptions = {
  config: { type: 'string' },
  json: { type: 'boolean' },
  manifest: { type: 'string' },
  rebuild: { type: 'boolean' },
  recursive: { type: 'boolean' },
  // Declared so that strict parsing accepts it; `routeCommand` consumed its value before dispatch.
  style: { type: 'string' },
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
export async function verifyCommand(args: string[]): Promise<number> {
  let parsed;
  try {
    parsed = nodeParseArgs({ args, options: verifyOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error, 'verify'), { cause: error });
  }
  const { values, positionals } = parsed;

  if (positionals.length > 0) {
    throw usageError('rdy verify does not accept positional arguments.');
  }

  for (const [name, value] of Object.entries(values)) {
    if (value === '') {
      throw usageError(`--${name} requires a value`);
    }
  }

  const json = values.json === true;
  const rebuild = values.rebuild === true;
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
  if (rebuild) await requireEsbuild();

  if (recursive) {
    return verifyRecursive({ rebuild, json });
  }

  const manifestPath = path.resolve(process.cwd(), values.manifest ?? DEFAULT_MANIFEST_PATH);
  const manifest = loadManifest(manifestPath, values.manifest);
  const projectDir = resolveManifestProjectDir(manifestPath);
  const config = await loadVerifyConfig(projectDir, values.config);
  const uncompiled = findUncompiledKits({
    manifest,
    manifestDir: path.dirname(manifestPath),
    srcDir: path.resolve(projectDir, config.compile.srcDir),
    selection: config.compile,
  });
  return finishVerify(await verifyManifest({ manifest, manifestPath, rebuild, json, uncompiled }), json);
}
