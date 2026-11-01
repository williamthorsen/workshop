import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse } from 'yaml';

import { isRecord } from '../portable/is-record.ts';
import { expandValue } from './expand-value.ts';
import { findRepoRoot, REPO_CONFIG_PATH } from './find-repo-root.ts';
import { findUnknownKey } from './find-unknown-key.ts';

/** The demo repository's settings, resolved from its configuration file. */
export interface RepoConfig {
  /** The directory under the archive root that keeps this repository's takes apart from other repositories'. */
  readonly archiveLabel: string;
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
  function fail(problem: string): RepoConfigResult {
    return { ok: false, message: `${configPath}: ${problem}` };
  }

  let parsed: unknown;
  try {
    parsed = parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    return fail(`cannot be read as YAML (${describeError(error)})`);
  }

  // An empty file declares nothing, so every default applies.
  const document = parsed ?? {};
  if (!isRecord(document)) return fail('must be a mapping');

  const unknownKey = findUnknownKey(document, ['aidemo', 'archive', 'demosDir']);
  if (unknownKey !== undefined) {
    return fail(`unknown key "${unknownKey}"; the keys are aidemo, archive, and demosDir`);
  }

  const demosDir = readDemosDir(document['demosDir']);
  if (!demosDir.ok) return fail(`demosDir ${demosDir.problem}`);

  const aidemoEnv = readAidemoEnv(document['aidemo'], env, homeDir);
  if (!aidemoEnv.ok) return fail(aidemoEnv.problem);

  const archiveLabel = readArchiveLabel(document['archive'], root);
  if (!archiveLabel.ok) return fail(archiveLabel.problem);

  return {
    ok: true,
    config: {
      aidemoEnv: aidemoEnv.value,
      archiveLabel: archiveLabel.value,
      configPath,
      demosDir: demosDir.value,
      root,
    },
  };
}

// region | Helpers

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

/**
 * Validates the `archive` section, whose one key is `label`, defaulting the label to the root directory's name. The
 * label becomes one path segment, so it cannot contain a separator or be `.` or `..`.
 */
function readArchiveLabel(
  section: unknown,
  root: string,
): { ok: true; value: string } | { ok: false; problem: string } {
  if (section === undefined || section === null) return { ok: true, value: path.basename(root) };
  if (!isRecord(section)) return { ok: false, problem: 'archive must be a mapping' };

  const unknownKey = findUnknownKey(section, ['label']);
  if (unknownKey !== undefined) return { ok: false, problem: `unknown key "archive.${unknownKey}"; the key is label` };

  const raw = section['label'];
  if (raw === undefined || raw === null) return { ok: true, value: path.basename(root) };
  if (typeof raw !== 'string' || raw === '') return { ok: false, problem: 'archive.label must be a non-empty string' };
  if (/[/\\]/.test(raw) || raw === '.' || raw === '..') {
    return { ok: false, problem: `archive.label must be a single directory name, not "${raw}"` };
  }

  return { ok: true, value: raw };
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
