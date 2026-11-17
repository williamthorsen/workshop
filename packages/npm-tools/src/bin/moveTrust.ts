import { UsageError } from '@williamthorsen/toolbelt.cli/candidate';

import { type GithubTrust, type NpmClient, TRUST_PERMISSION_FLAGS } from '../npm/createNpmClient.ts';
import type { TrustListing } from '../npm/parseTrustListing.ts';
import { assertValidName } from './assertValidName.ts';

const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const WORKFLOW_FILE_PATTERN = /^[^/\\]+\.ya?ml$/;

/**
 * Revokes the old trust, then adds the new one. The registry holds one trust per package, so the revoke comes first;
 * when the add fails, the old trust stays revoked until `restoreTrust` adds it back.
 *
 * @internal
 */
export function applyMoveTrust(plan: ReadyMoveTrustPlan, effects: MoveTrustEffects): MoveTrustOutcome {
  const { npm } = effects;

  const revokeOutcome = npm.revokeTrust(plan.name, plan.id);
  if (revokeOutcome.kind === 'failed') return { kind: 'revoke-failed', detail: revokeOutcome.detail };

  const addOutcome = npm.addGithubTrust(plan.name, plan.newTrust);
  return addOutcome.kind === 'added' ? { kind: 'moved' } : { kind: 'add-failed', detail: addOutcome.detail };
}

/**
 * Checks that a package's GitHub trusted publisher can be moved: the terminal that npm's approval needs, the operand
 * and flags, and that the package has exactly one trust, a GitHub one belonging to `from` that names everything a
 * restore needs. A usage problem is thrown as a `UsageError`.
 *
 * @internal
 */
export function planMoveTrust(options: MoveTrustOptions, effects: PlanMoveTrustEffects): MoveTrustPlan {
  const { file, from, name, to } = options;

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

  const listing = effects.npm.listTrust(name);
  if (listing.kind === 'missing') return { kind: 'npm-missing' };
  if (listing.kind === 'failed') return { kind: 'listing-failed', detail: listing.detail, name };

  const selection = selectCurrentTrust(name, from, listing);
  if (selection.kind === 'refused') return selection;

  const oldTrust = selection.trust;
  const newTrust: GithubTrust = { ...oldTrust, file: file ?? oldTrust.file, repository: to };
  return { kind: 'ready', id: selection.id, name, newTrust, oldTrust };
}

/**
 * Adds the old trust back after a failed add.
 *
 * @internal
 */
export function restoreTrust(plan: ReadyMoveTrustPlan, effects: MoveTrustEffects): RestoreTrustOutcome {
  const outcome = effects.npm.addGithubTrust(plan.name, plan.oldTrust);
  return outcome.kind === 'added' ? { kind: 'restored' } : { kind: 'failed', detail: outcome.detail };
}

/** The effects that revoking, adding, and restoring a trust need. */
export interface MoveTrustEffects {
  readonly npm: NpmClient;
}

/** The parsed `move-trust` operand and flags. */
export interface MoveTrustOptions {
  readonly dryRun: boolean;
  readonly file?: string | undefined;
  readonly force: boolean;
  readonly from?: string | undefined;
  readonly name: string;
  readonly to?: string | undefined;
}

/** What moving a trust did. */
export type MoveTrustOutcome =
  | { readonly kind: 'add-failed'; readonly detail: string }
  | { readonly kind: 'moved' }
  | { readonly kind: 'revoke-failed'; readonly detail: string };

/** What checking a move found: a reason to refuse it, or the trust to revoke and the trust to add. */
export type MoveTrustPlan =
  | { readonly kind: 'listing-failed'; readonly detail: string; readonly name: string }
  | { readonly kind: 'npm-missing' }
  | {
      readonly kind: 'ready';
      readonly id: string;
      readonly name: string;
      readonly newTrust: GithubTrust;
      readonly oldTrust: GithubTrust;
    }
  | { readonly kind: 'refused'; readonly reason: string };

/** The effects that checking a move needs. */
export interface PlanMoveTrustEffects {
  /** Reports whether stdin is a terminal, which npm's approval needs. */
  readonly isStdinTty: () => boolean;
  /** Reports whether stdout is a terminal, which npm's approval needs. */
  readonly isStdoutTty: () => boolean;
  readonly npm: NpmClient;
}

/** A plan that is ready to apply. */
export type ReadyMoveTrustPlan = Extract<MoveTrustPlan, { kind: 'ready' }>;

/** What restoring the old trust did. */
export type RestoreTrustOutcome = { readonly kind: 'failed'; readonly detail: string } | { readonly kind: 'restored' };

// region | Helpers

/** Throws a `UsageError` when a flag is absent or its value is not an `owner/repo` name. */
function assertRepository(flag: string, value: string | undefined): asserts value is string {
  if (value === undefined) throw new UsageError(`${flag} <owner/repo> is required`);
  if (!REPOSITORY_PATTERN.test(value)) throw new UsageError(`${flag} takes an owner/repo name, not '${value}'`);
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
  const unknownPermissions = permissions.filter((permission) => TRUST_PERMISSION_FLAGS[permission] === undefined);
  const lack =
    file === undefined
      ? 'names no workflow file'
      : permissions.length === 0
        ? 'lists no permissions'
        : unknownPermissions.length > 0
          ? `has a permission that thor-npm cannot grant (${unknownPermissions.join(', ')})`
          : undefined;
  if (file === undefined || lack !== undefined) {
    return { kind: 'refused', reason: `the trusted publisher of '${name}' ${lack}, so it could not be restored` };
  }

  const trust: GithubTrust = { ...(environment !== undefined && { environment }), file, permissions, repository };
  return { kind: 'selected', id: entry.id, trust };
}

// endregion | Helpers
