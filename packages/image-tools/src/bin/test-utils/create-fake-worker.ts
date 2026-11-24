import type { WorkerRequest } from '../../jobs/build-jobs.ts';
import type { RunWorker, WorkerOutcome } from '../../worker/run-worker.ts';

/** A fake worker and the requests that it received. */
export interface FakeWorker {
  readonly requests: WorkerRequest[];
  readonly runWorker: RunWorker;
}

/**
 * Creates a worker that reports every job rendered at its requested size, or 1024x1024 when the size is left to
 * the edit variant, in 8 steps. With `failAt`, it reports that job failed and stops; with `outcome`, it returns
 * that outcome without reporting any event.
 */
export function createFakeWorker(options: { failAt?: number; outcome?: WorkerOutcome } = {}): FakeWorker {
  const requests: WorkerRequest[] = [];
  const runWorker: RunWorker = (request, { onEvent }) => {
    return Promise.resolve(renderAll(request, onEvent));
  };
  /** Reports each job's event in turn and returns the run's outcome. */
  function renderAll(request: WorkerRequest, onEvent: Parameters<RunWorker>[1]['onEvent']): WorkerOutcome {
    requests.push(request);
    if (options.outcome !== undefined) return options.outcome;

    onEvent({ event: 'started', mfluxVersion: '0.24.0' });
    const rendered = [];
    for (const [index, job] of request.jobs.entries()) {
      if (index === options.failAt) {
        onEvent({ event: 'failed', index, message: 'out of memory' });
        return {
          ok: false,
          kind: 'failed',
          mfluxVersion: '0.24.0',
          problem: `image ${index + 1} failed: out of memory`,
          rendered,
        };
      }
      const event = {
        event: 'rendered',
        height: job.height ?? 1024,
        index,
        steps: 8,
        width: job.width ?? 1024,
      } as const;
      rendered.push(event);
      onEvent(event);
    }
    return { ok: true, mfluxVersion: '0.24.0', rendered };
  }
  return { requests, runWorker };
}
