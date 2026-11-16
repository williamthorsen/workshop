import type { findPackageManagerPin, listStrandedAsdfShims } from '@williamthorsen/toolbelt.nodejs/candidate';

import type { resolvePnpmProvider } from './resolvePnpmProvider.ts';
import type { PruneModulesEffects } from './runPruneModules.ts';

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
