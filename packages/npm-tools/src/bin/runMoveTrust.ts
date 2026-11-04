import { UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

import {
  buildGithubTrustArgs,
  type GithubTrust,
  type NpmClient,
  TRUST_PERMISSION_FLAGS,
} from '../npm/createNpmClient.ts';
import type { TrustListing } from '../npm/parseTrustListing.ts';
import { quoteShellArgs } from '../npm/quoteShellArgs.ts';
import { assertValidName } from './assertValidName.ts';
import { isAffirmative } from './isAffirmative.ts';

const EXIT_FAILED = 1;
const EXIT_NPM_MISSING = 127;
const EXIT_OK = 0;
const PERMISSION_LABELS: Readonly<Record<string, string>> = {
  createPackage: 'publish',
  createStagedPackage: 'stage publish',
};
const PREFIX = 'thor-npm move-trust:';
const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const WORKFLOW_FILE_PATTERN = /^[^/\\]+\.ya?ml$/;

/**
 * Moves a package's GitHub trusted publisher from one repository to another, keeping its workflow file (unless
 * `file` names another), environment, and permissions. The registry holds one trust per package, so the old trust
 * is revoked before the new one is added, and restored when the add fails. Resolves to the exit code; a usage
 * problem is thrown as a `UsageError`. Everything it reports goes to stderr.
 *
 * @internal
 */
export async function runMoveTrust(
  options: MoveTrustOptions,
  effects: MoveTrustEffects,
  streams: { readonly stderr: Writer },
): Promise<number> {
  const { dryRun, file, force, from, name, to } = options;
  const { npm } = effects;

  function report(message: string): void {
    streams.stderr.write(`${PREFIX} ${message}\n`);
  }

  if (!effects.isStdinTty() || !effects.isStdoutTty()) {
    throw new UsageError('npm asks for approval at the terminal, so move-trust needs a terminal on stdin and stdout');
  }
  assertValidName(name, 'old');
  assertRepository('--from', from);
  assertRepository('--to', to);
  if (from.toLowerCase() === to.toLowerCase()) throw new UsageError(`--from and --to both name ${from}`);
  if (file !== undefined && !WORKFLOW_FILE_PATTERN.test(file)) {
    throw new UsageError(`--file takes a workflow file name ending in .yml or .yaml, not a path: '${file}'`);
  }

  const listing = npm.listTrust(name);
  if (listing.kind === 'missing') {
    report('npm not found on PATH; install Node.js with npm, then run this again');
    return EXIT_NPM_MISSING;
  }
  if (listing.kind === 'failed') {
    report(`could not list the trusted publishers of '${name}': ${listing.detail}; nothing was changed`);
    return EXIT_FAILED;
  }

  const selection = selectCurrentTrust(name, from, listing);
  if (selection.kind === 'refused') {
    report(`${selection.reason}; nothing was changed`);
    return EXIT_FAILED;
  }

  const old = selection.trust;
  const next: GithubTrust = { ...old, file: file ?? old.file, repository: to };
  streams.stderr.write(renderSummary(name, old, next, dryRun));

  if (dryRun) {
    report('nothing was changed (dry run)');
    return EXIT_OK;
  }

  if (!force) {
    const answer = await effects.readAnswer(`Move the trusted publisher of ${name} to ${to}? [y/N] `);
    if (!isAffirmative(answer)) {
      report('nothing was changed');
      return EXIT_FAILED;
    }
  }

  const revoked = npm.revokeTrust(name, selection.id);
  if (revoked.kind === 'failed') {
    report(`npm trust revoke failed (${revoked.detail}); nothing was changed`);
    return EXIT_FAILED;
  }

  const added = npm.addGithubTrust(name, next);
  if (added.kind === 'added') {
    report(`moved the trusted publisher of ${name} from ${old.repository} to ${to}`);
    return EXIT_OK;
  }

  report(`npm trust github failed (${added.detail}); restoring the trusted publisher for ${old.repository}`);
  const restored = npm.addGithubTrust(name, old);
  if (restored.kind === 'added') {
    report(`restored the trusted publisher for ${old.repository}; nothing was moved`);
    return EXIT_FAILED;
  }

  report(
    `restoring failed (${restored.detail}); ${name} has no trusted publisher. Restore it with:\n  ${quoteShellArgs(['npm', ...buildGithubTrustArgs(name, old)])}`,
  );
  return EXIT_FAILED;
}

/** The effects that moving a trust needs. */
export interface MoveTrustEffects {
  /** Reports whether stdin is a terminal, which npm's approval needs. */
  readonly isStdinTty: () => boolean;
  /** Reports whether stdout is a terminal, which npm's approval needs. */
  readonly isStdoutTty: () => boolean;
  readonly npm: NpmClient;
  /** Asks a question on stderr and resolves to the line typed in answer, or undefined at the end of input. */
  readonly readAnswer: (question: string) => Promise<string | undefined>;
}

/** The parsed `move-trust` operand and flags. */
export interface MoveTrustOptions {
  readonly dryRun: boolean;
  readonly file?: string | undefined;
  readonly force: boolean;
  readonly from: string;
  readonly name: string;
  readonly to: string;
}

// region | Helpers

/** Throws a `UsageError` when a flag's value is not an `owner/repo` name. */
function assertRepository(flag: string, value: string): void {
  if (!REPOSITORY_PATTERN.test(value)) throw new UsageError(`${flag} takes an owner/repo name, not '${value}'`);
}

/** Renders the summary of the move, or of the move that a dry run would make. */
function renderSummary(name: string, old: GithubTrust, next: GithubTrust, dryRun: boolean): string {
  const lines = [
    ['Package', name],
    ['From', old.repository],
    ['To', next.repository],
    ['Workflow', old.file === next.file ? old.file : `${old.file} → ${next.file}`],
    ['Environment', old.environment ?? 'none'],
    ['Permissions', old.permissions.map((permission) => PERMISSION_LABELS[permission] ?? permission).join(', ')],
    ['Mode', dryRun ? 'dry run' : 'move'],
  ].map(([label, value]) => `  ${label}: ${value}`);

  return `${lines.join('\n')}\n`;
}

/**
 * Selects the trust to move: the listing's one GitHub entry, when it belongs to `from` and names everything that a
 * restore needs. Otherwise returns the reason for refusing.
 */
function selectCurrentTrust(
  name: string,
  from: string,
  listing: TrustListing,
): { kind: 'refused'; reason: string } | { kind: 'selected'; id: string; trust: GithubTrust } {
  const { entries, otherCount } = listing;
  const [entry] = entries;

  if (otherCount > 0) {
    return { kind: 'refused', reason: `'${name}' has a trusted publisher that is not on GitHub` };
  }
  if (entry === undefined) {
    return { kind: 'refused', reason: `'${name}' has no trusted publisher; npm trust github adds one` };
  }
  if (entries.length > 1) {
    return { kind: 'refused', reason: `'${name}' has more than one trusted publisher` };
  }
  if (entry.repository.toLowerCase() !== from.toLowerCase()) {
    return { kind: 'refused', reason: `the trusted publisher of '${name}' is ${entry.repository}, not ${from}` };
  }

  const { environment, file, permissions, repository } = entry;
  const unknown = permissions.filter((permission) => TRUST_PERMISSION_FLAGS[permission] === undefined);
  const lack =
    file === undefined
      ? 'names no workflow file'
      : permissions.length === 0
        ? 'lists no permissions'
        : unknown.length > 0
          ? `has a permission that thor-npm cannot grant (${unknown.join(', ')})`
          : undefined;
  if (file === undefined || lack !== undefined) {
    return { kind: 'refused', reason: `the trusted publisher of '${name}' ${lack}, so it could not be restored` };
  }

  const trust: GithubTrust = { ...(environment !== undefined && { environment }), file, permissions, repository };
  return { kind: 'selected', id: entry.id, trust };
}

// endregion | Helpers
