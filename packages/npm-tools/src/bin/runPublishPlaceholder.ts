import fs from 'node:fs';
import path from 'node:path';

import { UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

import type { NpmClient } from '../npm/createNpmClient.ts';
import { assertValidName } from './assertValidName.ts';
import { isAffirmative } from './isAffirmative.ts';

const EXIT_FAILED = 1;
const EXIT_NPM_MISSING = 127;
const EXIT_OK = 0;
const PLACEHOLDER_FILES = ['package.json', 'README.md'];
const PLACEHOLDER_VERSION = '0.0.0';
const PREFIX = 'thor-npm publish-placeholder:';

/**
 * Publishes a `<name>@0.0.0` placeholder holding only `package.json` and `README.md`, after checking the name, the
 * npm session, and that the registry does not have the name. Resolves to the exit code; a usage problem is thrown as
 * a `UsageError`. Everything it reports goes to stderr.
 *
 * @internal
 */
export async function runPublishPlaceholder(
  options: PublishPlaceholderOptions,
  effects: PublishPlaceholderEffects,
  streams: { readonly stderr: Writer },
): Promise<number> {
  const { dryRun, force, name } = options;
  const { npm } = effects;

  function report(message: string): void {
    streams.stderr.write(`${PREFIX} ${message}\n`);
  }

  if (!dryRun && !force && !effects.isStdinTty()) {
    throw new UsageError(
      'confirming the publish needs a terminal on stdin; pass --force to publish without asking, or --dry-run to check without publishing',
    );
  }
  assertValidName(name, 'new');

  const session = npm.whoami();
  if (session.kind === 'missing') {
    report('npm not found on PATH; install Node.js with npm, then run this again');
    return EXIT_NPM_MISSING;
  }
  if (session.kind === 'logged-out') {
    report(`not logged in to npm (${session.detail}); run npm login, then run this again`);
    return EXIT_FAILED;
  }

  const existing = npm.findVersion(name);
  if (existing.kind === 'found') {
    report(`'${name}' already exists on the registry; a placeholder is only for a new name`);
    return EXIT_FAILED;
  }
  if (existing.kind === 'failed') {
    report(`could not query the registry for '${name}': ${existing.detail}`);
    return EXIT_FAILED;
  }

  const dir = effects.createTempDir();
  try {
    writePlaceholder(dir, name);
    streams.stderr.write(renderSummary(name, dryRun));

    if (dryRun) {
      report('nothing was published (dry run)');
      return EXIT_OK;
    }

    if (!force) {
      const answer = await effects.readAnswer(`Publish ${name}@${PLACEHOLDER_VERSION}? [y/N] `);
      if (!isAffirmative(answer)) {
        report('nothing was published');
        return EXIT_FAILED;
      }
    }

    const outcome = npm.publish(dir);
    if (outcome.kind === 'failed') {
      report(`npm publish failed (${outcome.detail}); nothing was published`);
      return EXIT_FAILED;
    }

    report(`published ${name}@${PLACEHOLDER_VERSION}`);
    return EXIT_OK;
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

/** The effects that a placeholder publish needs beyond the filesystem. */
export interface PublishPlaceholderEffects {
  /** Creates a new empty directory and returns its path. */
  readonly createTempDir: () => string;
  /** Reports whether stdin is a terminal, which confirmation needs. */
  readonly isStdinTty: () => boolean;
  readonly npm: NpmClient;
  /** Asks a question on stderr and resolves to the line typed in answer, or undefined at the end of input. */
  readonly readAnswer: (question: string) => Promise<string | undefined>;
}

/** The parsed `publish-placeholder` operand and flags. */
export interface PublishPlaceholderOptions {
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly name: string;
}

// region | Helpers

/** Renders the summary of what the run publishes, or would publish under a dry run. */
function renderSummary(name: string, dryRun: boolean): string {
  const lines = [
    ['Package', name],
    ['Version', PLACEHOLDER_VERSION],
    ['Access', 'public'],
    ['Files', PLACEHOLDER_FILES.join(', ')],
    ['Mode', dryRun ? 'dry run' : 'publish'],
  ].map(([label, value]) => `  ${label}: ${value}`);

  return `${lines.join('\n')}\n`;
}

/** Writes the placeholder's `package.json` and `README.md` into a directory. */
function writePlaceholder(dir: string, name: string): void {
  const manifest = { name, version: PLACEHOLDER_VERSION };
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'README.md'), `Placeholder for \`${name}\`, awaiting first release.\n`);
}

// endregion | Helpers
