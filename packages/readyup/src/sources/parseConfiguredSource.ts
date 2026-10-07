import { describeError } from '@williamthorsen/toolbelt.errors';

import { configError } from '../errors/RdyError.ts';
import { type BitbucketSource, type GitHubSource, type NpmSource, parseFromValue } from '../kits/parseFromValue.ts';

/** A kit source that the config's `sources` list names, with the spelling under which the config names it. */
export interface ConfiguredSource {
  spelling: string;
  source: NpmSource | GitHubSource | BitbucketSource;
}

/**
 * Parses one `sources` entry, which is spelled as `--from` takes it but limited to the schemes that name a publisher.
 *
 * A directory, `global`, or a local path names a place on this machine rather than a publisher, so it has no
 * stable meaning in a config shared by everyone who checks the project out.
 */
export function parseConfiguredSource(entry: string): ConfiguredSource {
  if (!/^[a-z]+:/.test(entry)) {
    throw configError(`Source "${entry}" has no scheme; write an installed package as "npm:${entry}".`);
  }

  let source;
  try {
    source = parseFromValue(entry);
  } catch (error: unknown) {
    throw configError(`Source "${entry}" is malformed: ${describeError(error)}`, { cause: error });
  }

  if (source.type === 'npm' && source.versionSpec !== undefined) {
    throw configError(
      `Source "${entry}" names a version, which is not supported yet; write "npm:${source.name}" to use the installed copy.`,
    );
  }

  switch (source.type) {
    case 'bitbucket':
    case 'github':
    case 'npm':
      return { spelling: entry, source };
    default:
      throw configError(`Source "${entry}" is not supported; a source is "npm:", "github:", or "bitbucket:".`);
  }
}
