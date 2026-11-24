import { spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { findPackageRoot } from '@williamthorsen/toolbelt.packaging';

import type { WorkerRequest } from '../jobs/build-jobs.ts';
import { parseWorkerEvent, type RenderedEvent, type WorkerEvent } from './parse-worker-event.ts';

/** The mflux release that the worker runs, whose model classes `worker/render.py` calls. */
export const MFLUX_VERSION = '0.24.0';

/** The Python version that `uv` runs the worker on, inside mflux's `>=3.11`. */
export const PYTHON_VERSION = '3.12';

/** The worker script that ships with the package. */
export const WORKER_PATH = path.join(findPackageRoot(import.meta.url), 'worker', 'render.py');

/** How a worker run ended: every job rendered, `uv` absent from `PATH`, or a failure partway. */
export type WorkerOutcome =
  | { ok: true; mfluxVersion: string; rendered: readonly RenderedEvent[] }
  | { ok: false; kind: 'missing-uv' }
  | {
      ok: false;
      kind: 'failed';
      mfluxVersion: string | undefined;
      problem: string;
      rendered: readonly RenderedEvent[];
    };

/** Runs one worker request, passing each event to `onEvent` as it arrives. */
export type RunWorker = (
  request: WorkerRequest,
  options: { env: Readonly<Record<string, string | undefined>>; onEvent: (event: WorkerEvent) => void },
) => Promise<WorkerOutcome>;

/** Returns the `uv` arguments that run the bundled worker with the pinned mflux. */
export function buildWorkerArgs(): string[] {
  return [
    'run',
    '--no-project',
    '--python',
    PYTHON_VERSION,
    '--with',
    `mflux==${MFLUX_VERSION}`,
    'python',
    WORKER_PATH,
  ];
}

/**
 * Spawns the worker through `uv`, writes `request` to its stdin, and reads its events from stdout. The worker's
 * stderr, which carries mflux's downloads and progress, passes through to this process's stderr.
 */
export const runWorker: RunWorker = (request, { env, onEvent }) =>
  new Promise((resolve) => {
    const child = spawn('uv', buildWorkerArgs(), { env, stdio: ['pipe', 'pipe', 'inherit'] });
    const rendered: RenderedEvent[] = [];
    let mfluxVersion: string | undefined;
    let problem: string | undefined;
    let isSpawnMissing = false;

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') isSpawnMissing = true;
      else problem ??= `the worker could not start: ${error.message}`;
    });
    // A worker that exits before reading its request closes stdin early; its exit status reports the failure.
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));

    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      const event = parseWorkerEvent(line);
      if (event === undefined) {
        problem ??= `the worker wrote a line that is not an event: ${line.slice(0, 200)}`;
        child.kill();
        return;
      }
      if (event.event === 'started') mfluxVersion = event.mfluxVersion;
      else if (event.event === 'rendered') rendered.push(event);
      else problem ??= `image ${event.index + 1} failed: ${event.message}`;
      onEvent(event);
    });

    child.on('close', (code, signal) => {
      if (isSpawnMissing) {
        resolve({ ok: false, kind: 'missing-uv' });
        return;
      }
      if (
        problem === undefined &&
        code === 0 &&
        rendered.length === request.jobs.length &&
        mfluxVersion !== undefined
      ) {
        resolve({ ok: true, mfluxVersion, rendered });
        return;
      }
      const ending = signal === null ? `exited with ${code}` : `was stopped by ${signal}`;
      resolve({
        ok: false,
        kind: 'failed',
        mfluxVersion,
        problem: problem ?? `the worker ${ending} after ${rendered.length} of ${request.jobs.length} images`,
        rendered,
      });
    });
  });
