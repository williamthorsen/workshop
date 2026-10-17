import path from 'node:path';

import { type AsdfInstall, findAsdfInstall, type StrandedAsdfShim } from '@williamthorsen/toolbelt.nodejs/candidate';

import {
  COREPACK,
  EXIT_FINDINGS,
  EXIT_NOT_APPLICABLE,
  EXIT_OK,
  PLUGIN,
  RESHIM,
  type ThorNodeEffects,
  type ThorNodeResult,
} from './thor-node-result.ts';

/** Reports the shims that the active version does not provide. */
export function runAsdfShims(effects: ThorNodeEffects): ThorNodeResult {
  const install = findAsdfInstall(effects.execPath);
  if (install === undefined || install.plugin !== PLUGIN) {
    return {
      exitCode: EXIT_NOT_APPLICABLE,
      stderr: `node at ${effects.execPath} is not an asdf ${PLUGIN} install; nothing to check.\n`,
      stdout: '',
    };
  }

  const shims = effects.listStrandedShims({
    dataDir: install.dataDir,
    pathDirs: effects.pathDirs,
    plugin: PLUGIN,
    version: install.version,
  });

  return {
    exitCode: shims.length === 0 ? EXIT_OK : EXIT_FINDINGS,
    stderr: '',
    stdout: `${renderReport(install, shims)}\n`,
  };
}

// region | Helpers

/**
 * Renders the commands that put the command under the active version, or nothing when the package is unknown.
 * When the active version has no corepack to run, the commands for a shim that corepack backs start by installing it.
 */
function listProvideCommands(shim: StrandedAsdfShim, lacksCorepack: boolean): string[] {
  if (shim.backingPackage === undefined) return [];
  if (shim.backingPackage !== COREPACK) return [`npm install --global ${shim.backingPackage}`, RESHIM];

  const installCorepack = lacksCorepack ? [`npm install --global ${COREPACK}`, RESHIM] : [];

  return shim.name === COREPACK && lacksCorepack ? installCorepack : [...installCorepack, 'corepack enable', RESHIM];
}

/** Renders the commands that remove the command from every providing version, so that reshimming removes the shim. */
function listRemoveCommands(shim: StrandedAsdfShim, install: AsdfInstall): string[] {
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
function renderReport(install: AsdfInstall, shims: readonly StrandedAsdfShim[]): string {
  const shimsDir = path.join(install.dataDir, 'shims');
  const count = shims.length === 1 ? '1 stranded shim' : `${shims.length} stranded shims`;
  const headline = `${PLUGIN} ${install.version} (asdf): ${shims.length === 0 ? 'no stranded shims' : `${count} in ${shimsDir}`}`;

  // A stranded `corepack` shim means that the active version includes no corepack, as node 25 and later do not.
  const lacksCorepack = shims.some((shim) => shim.name === COREPACK);

  return [headline, ...shims.map((shim) => renderShim(shim, install, lacksCorepack))].join('\n\n');
}

/** Renders one stranded shim: its class, its providers, and the commands that provide or remove it. */
function renderShim(shim: StrandedAsdfShim, install: AsdfInstall, lacksCorepack: boolean): string {
  const status =
    shim.otherProvider === undefined ? 'stranded, no other provider on PATH' : `orphan, shadows ${shim.otherProvider}`;
  const backing = shim.backingPackage === undefined ? '' : ` (npm package ${shim.backingPackage})`;
  const lines = [`${shim.name}: ${status}`, `  provided by ${PLUGIN} ${shim.providingVersions.join(', ')}${backing}`];

  const provideCommands = shim.otherProvider === undefined ? listProvideCommands(shim, lacksCorepack) : [];
  if (provideCommands.length > 0) {
    lines.push(`  to provide it under ${install.version}:`, ...provideCommands.map((command) => `    ${command}`));
  }
  lines.push('  to remove it:', ...listRemoveCommands(shim, install).map((command) => `    ${command}`));

  return lines.join('\n');
}

// endregion | Helpers
