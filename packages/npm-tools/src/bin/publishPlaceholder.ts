import fs from 'node:fs';
import path from 'node:path';

import { UsageError } from '@williamthorsen/toolbelt.cli/candidate';

import type { NpmClient } from '../npm/createNpmClient.ts';
import { assertValidName } from './assertValidName.ts';

export const PLACEHOLDER_FILES = ['package.json', 'README.md'];
export const PLACEHOLDER_VERSION = '0.0.0';

/**
 * Checks that a placeholder for `name` can be published: the terminal that confirmation needs, the name, the npm
 * session, and that the registry does not have the name. A usage problem is thrown as a `UsageError`.
 *
 * @internal
 */
export function planPublishPlaceholder(
  options: PublishPlaceholderOptions,
  effects: PlanPublishPlaceholderEffects,
): PublishPlaceholderPlan {
  const { dryRun, force, name } = options;
  const { npm } = effects;

  if (!dryRun && !force && !effects.isStdinTty()) {
    throw new UsageError(
      'confirming the publish needs a terminal on stdin; pass --force to publish without asking, or --dry-run to check without publishing',
    );
  }
  assertValidName(name, 'new');

  const session = npm.whoami();
  if (session.kind === 'missing') return { kind: 'npm-missing' };
  if (session.kind === 'logged-out') return { kind: 'logged-out', detail: session.detail };
  if (session.kind === 'failed') return { kind: 'session-failed', detail: session.detail };

  const lookupOutcome = npm.findVersion(name);
  if (lookupOutcome.kind === 'found') return { kind: 'name-taken', name };
  if (lookupOutcome.kind === 'failed') return { kind: 'lookup-failed', detail: lookupOutcome.detail, name };

  return { kind: 'ready', name };
}

/**
 * Publishes a `<name>@0.0.0` placeholder holding only `package.json` and `README.md`, built in a temporary directory
 * that is removed afterwards.
 *
 * @internal
 */
export function publishPlaceholder(name: string, effects: PublishPlaceholderEffects): PublishPlaceholderOutcome {
  const dir = effects.createTempDir();
  try {
    writePlaceholder(dir, name);
    const outcome = effects.npm.publish(dir);
    return outcome.kind === 'failed' ? { kind: 'failed', detail: outcome.detail } : { kind: 'published', name };
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

/** The effects that checking a placeholder publish needs. */
export interface PlanPublishPlaceholderEffects {
  /** Reports whether stdin is a terminal, which confirmation needs. */
  readonly isStdinTty: () => boolean;
  readonly npm: NpmClient;
}

/** The effects that publishing a placeholder needs beyond the filesystem. */
export interface PublishPlaceholderEffects {
  /** Creates a new empty directory and returns its path. */
  readonly createTempDir: () => string;
  readonly npm: NpmClient;
}

/** The parsed `publish-placeholder` operand and flags. */
export interface PublishPlaceholderOptions {
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly name: string;
}

/** What publishing a placeholder did. */
export type PublishPlaceholderOutcome =
  { readonly kind: 'failed'; readonly detail: string } | { readonly kind: 'published'; readonly name: string };

/** What checking a placeholder publish found: a reason to refuse it, or a name that is ready to publish. */
export type PublishPlaceholderPlan =
  | { readonly kind: 'logged-out'; readonly detail: string }
  | { readonly kind: 'lookup-failed'; readonly detail: string; readonly name: string }
  | { readonly kind: 'name-taken'; readonly name: string }
  | { readonly kind: 'npm-missing' }
  | { readonly kind: 'ready'; readonly name: string }
  | { readonly kind: 'session-failed'; readonly detail: string };

// region | Helpers

/** Writes the placeholder's `package.json` and `README.md` into a directory. */
function writePlaceholder(dir: string, name: string): void {
  const manifest = { name, version: PLACEHOLDER_VERSION };
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'README.md'), `Placeholder for \`${name}\`, awaiting first release.\n`);
}

// endregion | Helpers
