import path from 'node:path';

import { findAsdfInstall, type StrandedAsdfShim } from '@williamthorsen/toolbelt.nodejs/candidate';

import type { ThorNodeEffects } from './thor-node-effects.ts';
import {
  COREPACK,
  EXIT_FINDINGS,
  EXIT_NOT_APPLICABLE,
  EXIT_OK,
  PLUGIN,
  type RenderedText,
  RESHIM,
} from './thor-node-result.ts';

/** Renders an `asdf-shims` result as the report on stdout, or the reason on stderr when the check does not apply. */
export function renderAsdfShimsText(result: AsdfShimsResult): RenderedText {
  if (result.outcome === 'not-applicable') return { stderr: `${result.reason}\n`, stdout: '' };

  return { stderr: '', stdout: `${renderReport(result.install, result.shims)}\n` };
}

/** Returns the exit code for an `asdf-shims` result. */
export function resolveAsdfShimsExitCode(result: AsdfShimsResult): number {
  switch (result.outcome) {
    case 'clean':
      return EXIT_OK;
    case 'not-applicable':
      return EXIT_NOT_APPLICABLE;
    case 'stranded':
      return EXIT_FINDINGS;
  }
}

/** Finds the shims that the active version does not provide, with the commands that provide or remove each. */
export function runAsdfShims(effects: ThorNodeEffects): AsdfShimsResult {
  const install = findAsdfInstall(effects.execPath);
  if (install === undefined || install.plugin !== PLUGIN) {
    return {
      install: null,
      outcome: 'not-applicable',
      reason: `node at ${effects.execPath} is not an asdf ${PLUGIN} install; nothing to check.`,
      shims: [],
    };
  }

  const shims = effects.listStrandedShims({
    dataDir: install.dataDir,
    pathDirs: effects.pathDirs,
    plugin: PLUGIN,
    version: install.version,
  });
  const installRecord: AsdfInstallRecord = {
    dataDir: install.dataDir,
    plugin: install.plugin,
    version: install.version,
  };

  // A stranded `corepack` shim means that the active version includes no corepack, as node 25 and later do not.
  const lacksCorepack = shims.some((shim) => shim.name === COREPACK);

  return {
    install: installRecord,
    outcome: shims.length === 0 ? 'clean' : 'stranded',
    reason: null,
    shims: shims.map((shim) => describeShim(shim, installRecord, lacksCorepack)),
  };
}

/** The asdf install of the running node. */
export interface AsdfInstallRecord {
  readonly dataDir: string;
  readonly plugin: string;
  readonly version: string;
}

/** What `asdf-shims` found: the stranded shims under an asdf install, or why the check does not apply. */
export type AsdfShimsResult =
  | {
      readonly install: AsdfInstallRecord;
      readonly outcome: 'clean' | 'stranded';
      readonly reason: null;
      readonly shims: readonly StrandedShimRecord[];
    }
  | {
      readonly install: null;
      readonly outcome: 'not-applicable';
      readonly reason: string;
      readonly shims: readonly [];
    };

/** A stranded shim, with the commands that put its command under the active version or remove it. */
export interface StrandedShimRecord {
  readonly backingPackage: string | null;
  readonly name: string;
  readonly otherProvider: string | null;
  /** Empty when another executable on PATH provides the command, or when the package behind the shim is unknown. */
  readonly provideCommands: readonly string[];
  readonly providingVersions: readonly string[];
  readonly removeCommands: readonly string[];
}

// region | Helpers

/** Describes one stranded shim, with the commands that provide it, when nothing else does, and remove it. */
function describeShim(shim: StrandedAsdfShim, install: AsdfInstallRecord, lacksCorepack: boolean): StrandedShimRecord {
  return {
    backingPackage: shim.backingPackage ?? null,
    name: shim.name,
    otherProvider: shim.otherProvider ?? null,
    provideCommands: shim.otherProvider === undefined ? listProvideCommands(shim, lacksCorepack) : [],
    providingVersions: [...shim.providingVersions],
    removeCommands: listRemoveCommands(shim, install),
  };
}

/**
 * Lists the commands that put the command under the active version, or nothing when the package is unknown.
 * When the active version has no corepack to run, the commands for a shim that corepack backs start by installing it.
 */
function listProvideCommands(shim: StrandedAsdfShim, lacksCorepack: boolean): string[] {
  if (shim.backingPackage === undefined) return [];
  if (shim.backingPackage !== COREPACK) return [`npm install --global ${shim.backingPackage}`, RESHIM];

  const installCorepack = lacksCorepack ? [`npm install --global ${COREPACK}`, RESHIM] : [];

  return shim.name === COREPACK && lacksCorepack ? installCorepack : [...installCorepack, 'corepack enable', RESHIM];
}

/** Lists the commands that remove the command from every providing version, so that reshimming removes the shim. */
function listRemoveCommands(shim: StrandedAsdfShim, install: AsdfInstallRecord): string[] {
  const commands = shim.providingVersions.map((version) => {
    if (shim.backingPackage === undefined) {
      return `rm ${path.join(install.dataDir, 'installs', PLUGIN, version, 'bin', shim.name)}`;
    }
    if (shim.backingPackage === COREPACK) return `ASDF_NODEJS_VERSION=${version} corepack disable`;

    return `ASDF_NODEJS_VERSION=${version} npm uninstall --global ${shim.backingPackage}`;
  });

  return [...commands, RESHIM];
}

/** Renders the report of the stranded shims found under an install. */
function renderReport(install: AsdfInstallRecord, shims: readonly StrandedShimRecord[]): string {
  const shimsDir = path.join(install.dataDir, 'shims');
  const count = shims.length === 1 ? '1 stranded shim' : `${shims.length} stranded shims`;
  const headline = `${PLUGIN} ${install.version} (asdf): ${shims.length === 0 ? 'no stranded shims' : `${count} in ${shimsDir}`}`;

  return [headline, ...shims.map((shim) => renderShim(shim, install))].join('\n\n');
}

/** Renders one stranded shim: its class, its providers, and the commands that provide or remove it. */
function renderShim(shim: StrandedShimRecord, install: AsdfInstallRecord): string {
  const status =
    shim.otherProvider === null ? 'stranded, no other provider on PATH' : `orphan, shadows ${shim.otherProvider}`;
  const backing = shim.backingPackage === null ? '' : ` (npm package ${shim.backingPackage})`;
  const lines = [`${shim.name}: ${status}`, `  provided by ${PLUGIN} ${shim.providingVersions.join(', ')}${backing}`];

  if (shim.provideCommands.length > 0) {
    lines.push(`  to provide it under ${install.version}:`, ...shim.provideCommands.map((command) => `    ${command}`));
  }
  lines.push('  to remove it:', ...shim.removeCommands.map((command) => `    ${command}`));

  return lines.join('\n');
}

// endregion | Helpers
