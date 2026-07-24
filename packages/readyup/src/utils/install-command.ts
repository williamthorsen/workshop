import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from '../isRecord.ts';

/** Dev-dependency install commands, keyed by the package manager that runs them. */
const INSTALL_COMMANDS = new Map([
  ['bun', 'bun add --dev'],
  ['npm', 'npm install --save-dev'],
  ['pnpm', 'pnpm add --save-dev'],
  ['yarn', 'yarn add --dev'],
]);

/** Install command used when nothing in the directory chain identifies a package manager. */
const DEFAULT_COMMAND = 'npm install --save-dev';

/**
 * Lockfiles that identify a package manager, in the order they are probed within one directory.
 *
 * `package-lock.json` is probed last because it is the likeliest leftover of a migration away from
 * npm. Bun writes `bun.lock` from 1.2 onward and `bun.lockb` before that; a repo mid-migration can
 * carry both, so the text format is probed first.
 */
const LOCKFILE_MANAGERS = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
] as const;

/**
 * Build the command that installs a package as a dev dependency of the current project.
 *
 * The package manager comes from the nearest directory that names one, falling back to npm when
 * none does.
 */
export function buildInstallCommand(moduleName: string): string {
  return `${findInstallCommand() ?? DEFAULT_COMMAND} ${moduleName}`;
}

/**
 * Find the install command for the package manager governing the current directory.
 *
 * The search walks up from the current directory because in a workspace the lockfile and the
 * `packageManager` declaration sit at the repo root while commands run from a package
 * subdirectory. Within a directory an explicit `packageManager` outranks a lockfile, and the
 * nearest directory naming a manager wins over any further up.
 */
function findInstallCommand(): string | undefined {
  for (const directory of listSelfAndAncestors(process.cwd())) {
    const declared = readDeclaredManager(path.join(directory, 'package.json'));
    if (declared !== undefined) {
      return INSTALL_COMMANDS.get(declared);
    }

    for (const [lockfile, manager] of LOCKFILE_MANAGERS) {
      if (existsSync(path.join(directory, lockfile))) {
        return INSTALL_COMMANDS.get(manager);
      }
    }
  }

  return undefined;
}

/** Read the package-manager name from a `package.json`, dropping the version Corepack pins. */
function readDeclaredManager(packageJsonPath: string): string | undefined {
  if (!existsSync(packageJsonPath)) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch {
    return undefined;
  }

  const declared = isRecord(parsed) ? parsed.packageManager : undefined;
  return typeof declared === 'string' ? /^[a-z]+/.exec(declared)?.[0] : undefined;
}

/** List a directory and every directory above it, nearest first. */
function listSelfAndAncestors(from: string): string[] {
  const directories = [from];
  let current = from;
  let parent = path.dirname(current);

  while (parent !== current) {
    directories.push(parent);
    current = parent;
    parent = path.dirname(current);
  }

  return directories;
}
