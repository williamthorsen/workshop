import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** Dev-dependency install commands keyed by the lockfile that identifies their package manager. */
const LOCKFILE_COMMANDS = [
  { lockfile: 'pnpm-lock.yaml', command: 'pnpm add --save-dev' },
  { lockfile: 'yarn.lock', command: 'yarn add --dev' },
];

/** Install command used when no lockfile identifies a package manager. */
const DEFAULT_COMMAND = 'npm install --save-dev';

/**
 * Build the command that installs a package as a dev dependency of the current project.
 *
 * The package manager is read from the lockfile in the current directory, falling back to npm when
 * none names one.
 */
export function buildInstallCommand(moduleName: string): string {
  const match = LOCKFILE_COMMANDS.find(({ lockfile }) => existsSync(path.join(process.cwd(), lockfile)));
  return `${match?.command ?? DEFAULT_COMMAND} ${moduleName}`;
}
