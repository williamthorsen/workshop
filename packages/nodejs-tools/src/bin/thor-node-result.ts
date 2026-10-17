import { UsageError } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';
import type { findPackageManagerPin, listStrandedAsdfShims } from '@williamthorsen/toolbelt.nodejs/candidate';

import type { resolvePnpmProvider } from './resolvePnpmProvider.ts';
import type { PruneModulesEffects } from './runPruneModules.ts';

/** The exit code of a check that found nothing to fix. */
export const EXIT_OK = 0;
/** The exit code of a check that found something to fix. */
export const EXIT_FINDINGS = 1;
/** The exit code of a check that does not apply. */
export const EXIT_NOT_APPLICABLE = 3;

/** The name of corepack, as a command and as an npm package. */
export const COREPACK = 'corepack';
/** The asdf plugin that provides node. */
export const PLUGIN = 'nodejs';
/** The name of pnpm, as a command and as an npm package. */
export const PNPM = 'pnpm';
/** The command that regenerates every shim of the nodejs plugin. */
export const RESHIM = 'asdf reshim nodejs';

/** Reports a check's outcome on stdout, one line per entry, with the exit code for that outcome. */
export function report(exitCode: number, lines: readonly string[]): ThorNodeResult {
  return { exitCode, stderr: '', stdout: `${lines.join('\n')}\n` };
}

/** Reports a check that does not apply: the reason on stderr, and whatever was learned on stdout. */
export function reportNotApplicable(reason: string, stdout: string): ThorNodeResult {
  return { exitCode: EXIT_NOT_APPLICABLE, stderr: `${reason}\n`, stdout: `${stdout}\n` };
}

/** Resolves the installed version, reporting a failure as a usage error, which exits 2. */
export function resolveVersion(effects: { readonly resolveVersion: () => string }): string {
  try {
    return effects.resolveVersion();
  } catch (error) {
    throw new UsageError(describeError(error), { cause: error });
  }
}

/** What running `pnpm --version` produced: the version that it printed, or why it produced none. */
export type PnpmVersionResult = { readonly failure: string } | { readonly version: string };

/** The effects deferred to the entry point, which keeps the runner free of I/O. */
export interface ThorNodeEffects extends PruneModulesEffects {
  /** The working directory, from which the pin and the `.tool-versions` lookups ascend. */
  readonly cwd: string;
  /** The path of the node binary running the command, from which its asdf install is read. */
  readonly execPath: string;
  /** Finds the `packageManager` pin governing a directory. */
  readonly findPin: typeof findPackageManagerPin;
  /** Lists the shims that the active version does not provide. */
  readonly listStrandedShims: typeof listStrandedAsdfShims;
  /** The directories of PATH, in search order. */
  readonly pathDirs: readonly string[];
  /** Classifies the `pnpm` on PATH by what provides it. */
  readonly resolvePnpmProvider: typeof resolvePnpmProvider;
  readonly resolveVersion: () => string;
  /** Runs `pnpm --version` in a directory; the one process that the runner asks for. Never throws. */
  readonly runPnpmVersion: (dir: string) => PnpmVersionResult;
}

/** What a check should write to each stream and exit with. */
export interface ThorNodeResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}
