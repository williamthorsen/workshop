import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse } from 'yaml';

import { isRecord } from '../portable/is-record.ts';
import { expandValue } from './expand-value.ts';
import { findUnknownKey } from './find-unknown-key.ts';

/** The outcome of resolving the archive root: the root, `undefined` when nothing sets one, or what is wrong. */
export type ArchiveRootResult = { ok: true; archiveRoot: string | undefined } | { ok: false; message: string };

/** The variable that sets the archive root, overriding the machine configuration. */
export const ARCHIVE_ROOT_VARIABLE = 'THOR_DEMO_ARCHIVE_ROOT';

/** The machine configuration file, relative to the home directory. */
export const MACHINE_CONFIG_PATH = '.config/thor-demo/config.yaml';

/** What resolving the archive root takes from its caller's environment. */
export interface MachineConfigInput {
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: string;
}

/**
 * Resolves the archive root from `THOR_DEMO_ARCHIVE_ROOT`, then from `archive.root` in the machine configuration,
 * whose value expands like `aidemo.env`. Either must be an absolute path. A missing file sets nothing.
 */
export function resolveArchiveRoot({ env, homeDir }: MachineConfigInput): ArchiveRootResult {
  const fromEnv = env[ARCHIVE_ROOT_VARIABLE];
  if (fromEnv !== undefined && fromEnv !== '') {
    if (!path.isAbsolute(fromEnv)) {
      return { ok: false, message: `${ARCHIVE_ROOT_VARIABLE} must be an absolute path, not "${fromEnv}"` };
    }
    return { ok: true, archiveRoot: fromEnv };
  }

  const configPath = path.join(homeDir, MACHINE_CONFIG_PATH);
  if (!existsSync(configPath)) return { ok: true, archiveRoot: undefined };

  function fail(problem: string): ArchiveRootResult {
    return { ok: false, message: `${configPath}: ${problem}` };
  }

  let parsed: unknown;
  try {
    parsed = parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    return fail(`cannot be read as YAML (${describeError(error)})`);
  }

  const document = parsed ?? {};
  if (!isRecord(document)) return fail('must be a mapping');

  const unknownKey = findUnknownKey(document, ['archive']);
  if (unknownKey !== undefined) return fail(`unknown key "${unknownKey}"; the key is archive`);

  const section = document['archive'];
  if (section === undefined || section === null) return { ok: true, archiveRoot: undefined };
  if (!isRecord(section)) return fail('archive must be a mapping');

  const unknownArchiveKey = findUnknownKey(section, ['root']);
  if (unknownArchiveKey !== undefined) return fail(`unknown key "archive.${unknownArchiveKey}"; the key is root`);

  const raw = section['root'];
  if (raw === undefined || raw === null) return { ok: true, archiveRoot: undefined };
  if (typeof raw !== 'string' || raw === '') return fail('archive.root must be a non-empty string');

  const expansion = expandValue(raw, env, homeDir);
  if (!expansion.ok) return fail(`archive.root: ${expansion.problem}`);
  if (!path.isAbsolute(expansion.value)) {
    return fail(`archive.root must be an absolute path, not "${expansion.value}"`);
  }

  return { ok: true, archiveRoot: expansion.value };
}
