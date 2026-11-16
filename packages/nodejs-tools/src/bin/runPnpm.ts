import path from 'node:path';

import { findAsdfInstall, parsePackageManagerSpec } from '@williamthorsen/toolbelt.nodejs/candidate';

import type { PnpmProvider } from './resolvePnpmProvider.ts';
import type { ThorNodeEffects } from './thor-node-effects.ts';
import {
  COREPACK,
  EXIT_FINDINGS,
  EXIT_NOT_APPLICABLE,
  EXIT_OK,
  PLUGIN,
  PNPM,
  type RenderedText,
  RESHIM,
} from './thor-node-result.ts';

/** The `packageManager` pin that names pnpm, with the version that it pins. */
export interface PnpmPinRecord {
  /** The directory of the manifest, in which pnpm runs. */
  readonly dir: string;
  readonly manifestPath: string;
  readonly version: string;
}

/** What provides the `pnpm` on PATH, with every optional field present as null. */
export type PnpmProviderRecord =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'asdf-plugin';
      readonly path: string;
      readonly toolVersions: { readonly filePath: string; readonly version: string } | null;
      readonly versions: readonly string[];
    }
  | { readonly kind: 'corepack' | 'npm-global'; readonly nodeVersion: string | null; readonly path: string }
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'stranded-shim'; readonly path: string; readonly providingVersions: readonly string[] };

/** What `pnpm` found: how the pnpm that runs compares with the pin, or why the check does not apply. */
export type PnpmResult =
  | {
      readonly failure: null;
      readonly outcome: 'not-applicable';
      readonly pin: null;
      readonly provider: PnpmProviderRecord;
      readonly reason: string;
      readonly repairs: readonly [];
      readonly version: null;
    }
  | {
      readonly failure: null;
      readonly outcome: 'absent';
      readonly pin: PnpmPinRecord;
      readonly provider: PnpmProviderRecord;
      readonly reason: null;
      readonly repairs: readonly string[];
      readonly version: null;
    }
  | {
      /** Why pnpm reported no version: it could not be spawned, or it exited non-zero. */
      readonly failure: string;
      readonly outcome: 'no-version';
      readonly pin: PnpmPinRecord;
      readonly provider: PnpmProviderRecord;
      readonly reason: null;
      readonly repairs: readonly string[];
      readonly version: null;
    }
  | {
      readonly failure: null;
      readonly outcome: 'match' | 'mismatch';
      readonly pin: PnpmPinRecord;
      readonly provider: PnpmProviderRecord;
      readonly reason: null;
      /** Empty on a match. */
      readonly repairs: readonly string[];
      /** The version that `pnpm --version` printed in the pinned directory. */
      readonly version: string;
    };

/**
 * Renders a `pnpm` result as the report on stdout, with the reason on stderr when the check does not apply. The
 * running node's path decides how a stranded shim is described.
 */
export function renderPnpmText(result: PnpmResult, execPath: string): RenderedText {
  const providerLine = describeProvider(result.provider, execPath);
  if (result.outcome === 'not-applicable') return { stderr: `${result.reason}\n`, stdout: `${providerLine}\n` };

  const pinLabel = `packageManager ${PNPM}@${result.pin.version} in ${result.pin.manifestPath}`;
  const repairs = ['  to run the pinned version:', ...result.repairs.map((command) => `    ${command}`)];
  const lines = ((): string[] => {
    switch (result.outcome) {
      case 'absent':
        return [`pnpm is not on PATH; ${pinLabel} cannot run`, `  ${providerLine}`, ...repairs];
      case 'match':
        return [`pnpm ${result.version} matches ${pinLabel}`, `  ${providerLine}`];
      case 'mismatch':
        return [`pnpm ${result.version} does not match ${pinLabel}`, `  ${providerLine}`, ...repairs];
      case 'no-version':
        return [
          `pnpm reported no version (${result.failure}); ${pinLabel} did not run`,
          `  ${providerLine}`,
          ...repairs,
        ];
    }
  })();

  return { stderr: '', stdout: `${lines.join('\n')}\n` };
}

/** Returns the exit code for a `pnpm` result. */
export function resolvePnpmExitCode(result: PnpmResult): number {
  switch (result.outcome) {
    case 'absent':
    case 'mismatch':
    case 'no-version':
      return EXIT_FINDINGS;
    case 'match':
      return EXIT_OK;
    case 'not-applicable':
      return EXIT_NOT_APPLICABLE;
  }
}

/**
 * Checks the pnpm that runs in the working directory against the nearest `packageManager` pin, naming the provider
 * either way and listing repairs when the versions differ or pnpm does not run.
 */
export function runPnpm(effects: ThorNodeEffects): PnpmResult {
  const { cwd, execPath } = effects;
  const provider = describeProviderRecord(
    effects.resolvePnpmProvider({ cwd, execPath, homeDir: effects.homeDir, pathDirs: effects.pathDirs }),
  );

  const pin = effects.findPin(cwd);
  if (pin === undefined) {
    return buildNotApplicable(
      provider,
      `No package.json declaring packageManager at or above ${cwd}; nothing to check.`,
    );
  }
  const spec = parsePackageManagerSpec(pin.spec);
  if (spec === undefined) {
    return buildNotApplicable(
      provider,
      `packageManager ${pin.spec} in ${pin.manifestPath} is not <name>@<version>; nothing to check.`,
    );
  }
  if (spec.name !== PNPM) {
    return buildNotApplicable(
      provider,
      `packageManager in ${pin.manifestPath} is ${spec.name}, not ${PNPM}; nothing to check.`,
    );
  }

  const checked = {
    pin: { dir: pin.dir, manifestPath: pin.manifestPath, version: spec.version },
    provider,
    reason: null,
    repairs: listPnpmRepairs(provider, spec.version, pin.dir, execPath),
  };

  if (provider.kind === 'absent') return { ...checked, failure: null, outcome: 'absent', version: null };

  const result = effects.runPnpmVersion(pin.dir);
  if ('failure' in result) return { ...checked, failure: result.failure, outcome: 'no-version', version: null };
  if (result.version === spec.version) {
    return { ...checked, failure: null, outcome: 'match', repairs: [], version: result.version };
  }

  return { ...checked, failure: null, outcome: 'mismatch', version: result.version };
}

// region | Helpers

/** Builds the result of a check that does not apply, which still names the provider. */
function buildNotApplicable(provider: PnpmProviderRecord, reason: string): PnpmResult {
  return { failure: null, outcome: 'not-applicable', pin: null, provider, reason, repairs: [], version: null };
}

/** Renders the line naming the `pnpm` on PATH and what provides it. */
function describeProvider(provider: PnpmProviderRecord, execPath: string): string {
  if (provider.kind === 'absent') return 'pnpm on PATH: none';

  return `pnpm on PATH: ${provider.path}${describeProviderKind(provider, execPath)}`;
}

/** Renders what provides a found `pnpm`, led by the separator, or nothing when only its path is known. */
function describeProviderKind(provider: Exclude<PnpmProviderRecord, { kind: 'absent' }>, execPath: string): string {
  switch (provider.kind) {
    case 'asdf-plugin': {
      const selection = provider.toolVersions === null ? '' : ` (selected by ${provider.toolVersions.filePath})`;

      return `, asdf pnpm plugin${selection}`;
    }
    case 'corepack':
    case 'npm-global': {
      const label = provider.kind === COREPACK ? COREPACK : 'npm-global pnpm';

      return provider.nodeVersion === null ? `, ${label}` : `, ${label} under ${PLUGIN} ${provider.nodeVersion}`;
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

/** Copies a provider field by field, with each absent value as null. */
function describeProviderRecord(provider: PnpmProvider): PnpmProviderRecord {
  switch (provider.kind) {
    case 'absent':
      return { kind: 'absent' };
    case 'asdf-plugin': {
      const { toolVersions } = provider;

      return {
        kind: provider.kind,
        path: provider.path,
        toolVersions:
          toolVersions === undefined ? null : { filePath: toolVersions.filePath, version: toolVersions.version },
        versions: [...provider.versions],
      };
    }
    case 'corepack':
    case 'npm-global':
      return { kind: provider.kind, nodeVersion: provider.nodeVersion ?? null, path: provider.path };
    case 'path':
      return { kind: provider.kind, path: provider.path };
    case 'stranded-shim':
      return { kind: provider.kind, path: provider.path, providingVersions: [...provider.providingVersions] };
  }
}

/**
 * Lists the commands that install the pinned pnpm through what provides pnpm now. A provider under asdf
 * gets a reshim after a global install, so that the shim picks the command up.
 */
function listPnpmRepairs(provider: PnpmProviderRecord, version: string, pinDir: string, execPath: string): string[] {
  const globalInstall = `npm install --global ${PNPM}@${version}`;
  const reshim = findAsdfInstall(execPath)?.plugin === PLUGIN ? [RESHIM] : [];

  switch (provider.kind) {
    case 'absent':
    case 'npm-global':
    case 'stranded-shim':
      return [globalInstall, ...reshim];
    case 'asdf-plugin': {
      const selection =
        provider.toolVersions === null
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
