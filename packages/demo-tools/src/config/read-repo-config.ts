import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse } from 'yaml';

import { expandValue } from './expand-value.ts';
import { findRepoRoot, REPO_CONFIG_PATH } from './find-repo-root.ts';

/** The demo repository's settings, resolved from its configuration file. */
export interface RepoConfig {
  /** The environment that the configuration declares for aidemo, expanded. */
  readonly aidemoEnv: Readonly<Record<string, string>>;
  readonly configPath: string;
  /** The demos directory, relative to `root`, normalized and `/`-separated. */
  readonly demosDir: string;
  readonly root: string;
}

/** The outcome of reading the repository configuration: the settings, or a message naming what is wrong. */
export type RepoConfigResult = { ok: true; config: RepoConfig } | { ok: false; message: string };

/** The demos directory when the configuration does not set one. */
export const DEFAULT_DEMOS_DIR = 'demos';

/** What reading the configuration takes from its caller's environment. */
export interface RepoConfigInput {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: string;
}

/** Finds the demo repository above `cwd` and reads its configuration, validating every key. */
export function readRepoConfig({ cwd, env, homeDir }: RepoConfigInput): RepoConfigResult {
  const root = findRepoRoot(cwd);
  if (root === undefined) {
    return {
      ok: false,
      message: `${REPO_CONFIG_PATH} not found in ${cwd} or any parent directory; create it at the root of the demo repository`,
    };
  }

  const configPath = path.join(root, REPO_CONFIG_PATH);
  const fail = (problem: string): RepoConfigResult => ({ ok: false, message: `${configPath}: ${problem}` });

  let parsed: unknown;
  try {
    parsed = parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    return fail(`cannot be read as YAML (${describeError(error)})`);
  }

  // An empty file declares nothing, so every default applies.
  const document = parsed ?? {};
  if (!isRecord(document)) return fail('must be a mapping');

  const unknownKey = findUnknownKey(document, ['aidemo', 'demosDir']);
  if (unknownKey !== undefined) return fail(`unknown key "${unknownKey}"; the keys are aidemo and demosDir`);

  const demosDir = readDemosDir(document['demosDir']);
  if (!demosDir.ok) return fail(`demosDir ${demosDir.problem}`);

  const aidemoEnv = readAidemoEnv(document['aidemo'], env, homeDir);
  if (!aidemoEnv.ok) return fail(aidemoEnv.problem);

  return { ok: true, config: { aidemoEnv: aidemoEnv.value, configPath, demosDir: demosDir.value, root } };
}

// region | Helpers

/** Returns the first key of `record` that `known` does not list. */
function findUnknownKey(record: Record<string, unknown>, known: readonly string[]): string | undefined {
  return Object.keys(record).find((key) => !known.includes(key));
}

/** Reports whether a value is a plain mapping. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates and expands the `aidemo` section, whose one key is `env`. */
function readAidemoEnv(
  section: unknown,
  env: NodeJS.ProcessEnv,
  homeDir: string,
): { ok: true; value: Record<string, string> } | { ok: false; problem: string } {
  if (section === undefined || section === null) return { ok: true, value: {} };
  if (!isRecord(section)) return { ok: false, problem: 'aidemo must be a mapping' };

  const unknownKey = findUnknownKey(section, ['env']);
  if (unknownKey !== undefined) return { ok: false, problem: `unknown key "aidemo.${unknownKey}"; the key is env` };

  const rawEnv = section['env'];
  if (rawEnv === undefined || rawEnv === null) return { ok: true, value: {} };
  if (!isRecord(rawEnv)) return { ok: false, problem: 'aidemo.env must be a mapping of strings' };

  const value: Record<string, string> = {};
  for (const [name, raw] of Object.entries(rawEnv)) {
    if (typeof raw !== 'string') return { ok: false, problem: `aidemo.env.${name} must be a string` };

    const expansion = expandValue(raw, env, homeDir);
    if (!expansion.ok) return { ok: false, problem: `aidemo.env.${name}: ${expansion.problem}` };

    value[name] = expansion.value;
  }

  return { ok: true, value };
}

/** Validates `demosDir`, which must name a directory strictly inside the root. */
function readDemosDir(raw: unknown): { ok: true; value: string } | { ok: false; problem: string } {
  if (raw === undefined || raw === null) return { ok: true, value: DEFAULT_DEMOS_DIR };
  if (typeof raw !== 'string' || raw === '') return { ok: false, problem: 'must be a non-empty string' };
  if (path.isAbsolute(raw)) return { ok: false, problem: `must be relative to the repository root, not "${raw}"` };

  const normalized = path.posix.normalize(raw.replaceAll('\\', '/')).replace(/\/+$/, '');
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    return { ok: false, problem: `must name a directory inside the repository root, not "${raw}"` };
  }

  return { ok: true, value: normalized };
}

// endregion | Helpers
