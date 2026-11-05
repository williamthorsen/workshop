import type { Writer } from '@williamthorsen/toolbelt.cli/candidate';

import {
  buildAidemoEnv,
  CHROME_PROFILE_VARIABLE,
  OPENAI_VARIABLES,
  resolveDefaultProfileDir,
} from '../aidemo/build-aidemo-env.ts';
import { findEnvFileOverrides } from '../aidemo/find-env-file-overrides.ts';
import { resolveAidemo } from '../aidemo/resolve-aidemo.ts';
import { readRepoConfig, type RepoConfig } from '../config/read-repo-config.ts';
import type { Launch, RunEffects } from './run.ts';

/**
 * Builds the launch of aidemo with `args` in the demo repository, with the installed aidemo's version, reporting an
 * unusable aidemo install to `stderr` and warning about a `.env` that would restore an OpenAI variable.
 */
export function prepareLaunch(
  config: RepoConfig,
  args: readonly string[],
  effects: RunEffects,
  stderr: Writer,
  prefix: string,
): { aidemoVersion: string; launch: Launch } | undefined {
  const resolution = resolveAidemo(config.root);
  if (!resolution.ok) {
    stderr.write(`${prefix}: ${resolution.message}\n`);
    return undefined;
  }

  const overrides = findEnvFileOverrides(config.root, config.aidemoEnv, OPENAI_VARIABLES);
  if (overrides !== undefined) {
    stderr.write(
      `${prefix}: warning: ${overrides.envFilePath} sets ${overrides.names.join(', ')}, which aidemo loads over the environment that thor-demo passes; declare them in aidemo.env or remove them from the file to keep captions offline\n`,
    );
  }

  const defaultProfileDir = resolveDefaultProfileDir(effects.homeDir, config.archiveLabel);
  const env = buildAidemoEnv(effects.env, config.aidemoEnv, defaultProfileDir);
  const launch: Launch = { args, bin: resolution.aidemo.bin, cwd: config.root, env };

  return {
    aidemoVersion: resolution.aidemo.version,
    launch: env[CHROME_PROFILE_VARIABLE] === defaultProfileDir ? { ...launch, profileDir: defaultProfileDir } : launch,
  };
}

/** Reads the repository configuration, reporting a failure to `stderr`. */
export function readConfig(effects: RunEffects, stderr: Writer, prefix: string): RepoConfig | undefined {
  const result = readRepoConfig(effects);
  if (result.ok) return result.config;

  stderr.write(`${prefix}: ${result.message}\n`);
  return undefined;
}
