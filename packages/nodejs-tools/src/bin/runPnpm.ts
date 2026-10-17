import path from 'node:path';

import { findAsdfInstall, parsePackageManagerSpec } from '@williamthorsen/toolbelt.nodejs/candidate';

import type { PnpmProvider } from './resolvePnpmProvider.ts';
import {
  COREPACK,
  EXIT_FINDINGS,
  EXIT_OK,
  PLUGIN,
  PNPM,
  report,
  reportNotApplicable,
  RESHIM,
  type ThorNodeEffects,
  type ThorNodeResult,
} from './thor-node-result.ts';

/**
 * Checks the pnpm that runs in the working directory against the nearest `packageManager` pin, naming the provider
 * either way and printing repairs only when the versions differ.
 */
export function runPnpm(effects: ThorNodeEffects): ThorNodeResult {
  const { cwd, execPath } = effects;
  const provider = effects.resolvePnpmProvider({ cwd, execPath, homeDir: effects.homeDir, pathDirs: effects.pathDirs });
  const providerLine = describeProvider(provider, execPath);

  const pin = effects.findPin(cwd);
  if (pin === undefined) {
    return reportNotApplicable(
      `No package.json declaring packageManager at or above ${cwd}; nothing to check.`,
      providerLine,
    );
  }
  const spec = parsePackageManagerSpec(pin.spec);
  if (spec === undefined) {
    return reportNotApplicable(
      `packageManager ${pin.spec} in ${pin.manifestPath} is not <name>@<version>; nothing to check.`,
      providerLine,
    );
  }
  if (spec.name !== PNPM) {
    return reportNotApplicable(
      `packageManager in ${pin.manifestPath} is ${spec.name}, not ${PNPM}; nothing to check.`,
      providerLine,
    );
  }

  const pinLabel = `packageManager ${PNPM}@${spec.version} in ${pin.manifestPath}`;
  const repairs = [
    '  to run the pinned version:',
    ...listPnpmRepairs(provider, spec.version, pin.dir, execPath).map((command) => `    ${command}`),
  ];

  if (provider.kind === 'absent') {
    return report(EXIT_FINDINGS, [`pnpm is not on PATH; ${pinLabel} cannot run`, `  ${providerLine}`, ...repairs]);
  }

  const result = effects.runPnpmVersion(pin.dir);
  if ('failure' in result) {
    const headline = `pnpm reported no version (${result.failure}); ${pinLabel} did not run`;

    return report(EXIT_FINDINGS, [headline, `  ${providerLine}`, ...repairs]);
  }
  if (result.version === spec.version) {
    return report(EXIT_OK, [`pnpm ${result.version} matches ${pinLabel}`, `  ${providerLine}`]);
  }

  return report(EXIT_FINDINGS, [`pnpm ${result.version} does not match ${pinLabel}`, `  ${providerLine}`, ...repairs]);
}

// region | Helpers

/** Renders the line naming the `pnpm` on PATH and what provides it. */
function describeProvider(provider: PnpmProvider, execPath: string): string {
  if (provider.kind === 'absent') return 'pnpm on PATH: none';

  return `pnpm on PATH: ${provider.path}${describeProviderKind(provider, execPath)}`;
}

/** Renders what provides a found `pnpm`, led by the separator, or nothing when only its path is known. */
function describeProviderKind(provider: Exclude<PnpmProvider, { kind: 'absent' }>, execPath: string): string {
  switch (provider.kind) {
    case 'asdf-plugin': {
      const selection = provider.toolVersions === undefined ? '' : ` (selected by ${provider.toolVersions.filePath})`;

      return `, asdf pnpm plugin${selection}`;
    }
    case 'corepack':
    case 'npm-global': {
      const label = provider.kind === COREPACK ? COREPACK : 'npm-global pnpm';

      return provider.nodeVersion === undefined ? `, ${label}` : `, ${label} under ${PLUGIN} ${provider.nodeVersion}`;
    }
    case 'path':
      return '';
    case 'stranded-shim': {
      const providers = `provided by ${PLUGIN} ${provider.providingVersions.join(', ')}`;
      const install = findAsdfInstall(execPath);

      return install === undefined || install.plugin !== PLUGIN
        ? `, asdf shim ${providers}, while node at ${execPath} is not an asdf install`
        : `, asdf shim stranded under ${PLUGIN} ${install.version}, ${providers}; see thor-node asdf-shims`;
    }
  }
}

/**
 * Renders the commands that install the pinned pnpm through what provides pnpm now. A provider under asdf
 * gets a reshim after a global install, so that the shim picks the command up.
 */
function listPnpmRepairs(provider: PnpmProvider, version: string, pinDir: string, execPath: string): string[] {
  const globalInstall = `npm install --global ${PNPM}@${version}`;
  const reshim = findAsdfInstall(execPath)?.plugin === PLUGIN ? [RESHIM] : [];

  switch (provider.kind) {
    case 'absent':
    case 'npm-global':
    case 'stranded-shim':
      return [globalInstall, ...reshim];
    case 'asdf-plugin': {
      const selection =
        provider.toolVersions === undefined
          ? `add ${PNPM} ${version} to ${path.join(pinDir, '.tool-versions')}`
          : `set ${PNPM} ${version} in ${provider.toolVersions.filePath}`;

      return [`asdf install ${PNPM} ${version}`, selection];
    }
    case 'corepack':
      return [`${COREPACK} install`];
    case 'path':
      return [`install ${PNPM}@${version} where pnpm comes from: ${provider.path}`];
  }
}

// endregion | Helpers
