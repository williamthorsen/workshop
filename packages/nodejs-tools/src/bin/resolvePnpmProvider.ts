import fs from 'node:fs';
import path from 'node:path';

import {
  type AsdfShimProvider,
  findAsdfInstall,
  findExecutableOnPath,
  findToolVersionsEntry,
  parseAsdfShim,
  resolveNpmPackageOfBin,
  type ToolVersionsEntry,
} from '@williamthorsen/toolbelt.nodejs/candidate';

const COMMAND = 'pnpm';
const COREPACK = 'corepack';
const HEADER_BYTES = 4_096;
const NODE_PLUGIN = 'nodejs';
const PNPM_PLUGIN = 'pnpm';

/**
 * Classifies the `pnpm` on PATH by what provides it, reading files and spawning nothing. An asdf shim is classified
 * by the providers that its header names, and the `pnpm` plugin takes precedence over `nodejs`. A file that is not
 * a shim, or a `nodejs` shim at the running node's version, is classified by the npm package behind its bin symlink.
 *
 * @internal
 */
export function resolvePnpmProvider(options: ResolvePnpmProviderOptions): PnpmProvider {
  const { cwd, execPath, homeDir, pathDirs } = options;

  const pnpmPath = findExecutableOnPath(COMMAND, pathDirs);
  if (pnpmPath === undefined) return { kind: 'absent' };

  const providers = parseAsdfShim(readHeader(pnpmPath));
  if (providers.length === 0) {
    return classifyBin(pnpmPath, resolveNpmPackageOfBin(pnpmPath), findNodeVersionOfInstall(pnpmPath));
  }

  const pluginVersions = listVersions(providers, PNPM_PLUGIN);
  if (pluginVersions.length > 0) {
    const toolVersions = findToolVersionsEntry(PNPM_PLUGIN, { homeDir, startDir: cwd });

    return { kind: 'asdf-plugin', path: pnpmPath, toolVersions, versions: pluginVersions };
  }

  const nodeVersions = listVersions(providers, NODE_PLUGIN);
  if (nodeVersions.length === 0) return { kind: 'path', path: pnpmPath };

  const install = findAsdfInstall(execPath);
  if (install === undefined || install.plugin !== NODE_PLUGIN || !nodeVersions.includes(install.version)) {
    return { kind: 'stranded-shim', path: pnpmPath, providingVersions: nodeVersions };
  }

  const binPath = path.join(install.dataDir, 'installs', NODE_PLUGIN, install.version, 'bin', COMMAND);

  return classifyBin(pnpmPath, resolveNpmPackageOfBin(binPath), install.version);
}

/** What provides the `pnpm` on PATH. */
export type PnpmProvider =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'asdf-plugin';
      readonly path: string;
      /** The `.tool-versions` entry selecting the plugin's version from the working directory, if one is in reach. */
      readonly toolVersions: ToolVersionsEntry | undefined;
      /** The plugin versions that the shim's header names. */
      readonly versions: readonly string[];
    }
  | {
      readonly kind: 'corepack' | 'npm-global';
      /** The asdf nodejs version under which the bin was found, or `undefined` for a node outside asdf. */
      readonly nodeVersion: string | undefined;
      readonly path: string;
    }
  | {
      /** A pnpm matching no other kind, named by its path alone. */
      readonly kind: 'path';
      readonly path: string;
    }
  | {
      readonly kind: 'stranded-shim';
      readonly path: string;
      /** The nodejs versions that the shim's header names, none of them the running one. */
      readonly providingVersions: readonly string[];
    };

export interface ResolvePnpmProviderOptions {
  /** The directory from which a `.tool-versions` lookup ascends. */
  readonly cwd: string;
  /** The path of the node binary running the command, from which its asdf install is read. */
  readonly execPath: string;
  readonly homeDir: string;
  /** The directories of PATH, in search order. */
  readonly pathDirs: readonly string[];
}

// region | Helpers

/** Classifies a bin by the npm package behind it, falling back to the path when the package is unknown. */
function classifyBin(
  pnpmPath: string,
  backingPackage: string | undefined,
  nodeVersion: string | undefined,
): PnpmProvider {
  if (backingPackage === COREPACK) return { kind: 'corepack', nodeVersion, path: pnpmPath };
  if (backingPackage === COMMAND) return { kind: 'npm-global', nodeVersion, path: pnpmPath };

  return { kind: 'path', path: pnpmPath };
}

/** Reads the nodejs version of the asdf install that contains a path, or `undefined` when no nodejs install does. */
function findNodeVersionOfInstall(filePath: string): string | undefined {
  const install = findAsdfInstall(filePath);

  return install?.plugin === NODE_PLUGIN ? install.version : undefined;
}

/** Lists the versions that a shim's providers name for one plugin, in header order. */
function listVersions(providers: readonly AsdfShimProvider[], plugin: string): string[] {
  return providers.filter((provider) => provider.plugin === plugin).map((provider) => provider.version);
}

/** Reads the start of a file, which is where a shim's header is; a standalone pnpm binary is too large to read whole. */
function readHeader(filePath: string): string {
  const buffer = Buffer.alloc(HEADER_BYTES);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const bytesRead = fs.readSync(descriptor, buffer, 0, HEADER_BYTES, 0);

    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
}

// endregion | Helpers
