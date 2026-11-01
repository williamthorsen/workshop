import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** What a `thor-demo` process wrote and exited with. */
export interface ThorDemoRun {
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

const ENTRY_POINT = path.join(import.meta.dirname, '../thor-demo.ts');

/**
 * Runs the CLI's TypeScript entry point, whose types node strips, in `cwd` with `extraEnv` added. The inherited
 * aidemo, OpenAI, and `THOR_DEMO_` variables are removed, and `HOME` is `cwd` unless `extraEnv` sets it, so that the
 * machine's own configuration does not reach the process.
 */
export function runThorDemo(args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}): ThorDemoRun {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith('AIDEMO_') && !name.startsWith('OPENAI_') && !name.startsWith('THOR_DEMO_'),
    ),
  );
  const { status, stderr, stdout } = spawnSync(process.execPath, [ENTRY_POINT, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...env, HOME: cwd, ...extraEnv },
  });

  return { status, stderr, stdout };
}
