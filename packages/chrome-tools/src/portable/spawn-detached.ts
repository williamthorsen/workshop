import { spawn } from 'node:child_process';
import fs from 'node:fs';

/** Starts a program that outlives the caller, writing its output to a log. */
export type SpawnDetached = (program: string, args: readonly string[], options: SpawnDetachedOptions) => void;

export interface SpawnDetachedOptions {
  env?: NodeJS.ProcessEnv;
  /** The file that receives the program's stdout and stderr, emptied first. */
  logPath: string;
}

/**
 * Starts a program in a session of its own, with stdin closed and its output in the log, and releases it: The parent
 * keeps neither a descriptor nor a reference to it, so the parent exits while the program runs. A program that cannot
 * be started has the reason appended to the log, where a caller that reads the log back finds it.
 */
export const spawnDetached: SpawnDetached = (program, args, options) => {
  const fd = fs.openSync(options.logPath, 'w');
  try {
    const child = spawn(program, args, { detached: true, env: options.env, stdio: ['ignore', fd, fd] });
    child.on('error', (error) => {
      fs.appendFileSync(options.logPath, `${program}: ${error.message}\n`);
    });
    child.unref();
  } finally {
    fs.closeSync(fd);
  }
};
