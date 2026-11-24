import { isRecord } from '@williamthorsen/toolbelt.objects';

/** The first event, which names the mflux release that the worker imported. */
export interface StartedEvent {
  readonly event: 'started';
  readonly mfluxVersion: string;
}

/** A job that the worker rendered and saved, with the settings that mflux applied. */
export interface RenderedEvent {
  readonly event: 'rendered';
  readonly height: number;
  readonly index: number;
  readonly steps: number;
  readonly width: number;
}

/** The job that raised, after which the worker exits without attempting the rest. */
export interface FailedEvent {
  readonly event: 'failed';
  readonly index: number;
  readonly message: string;
}

/** One line of the worker's event stream. */
export type WorkerEvent = FailedEvent | RenderedEvent | StartedEvent;

/** Parses one line of the worker's stdout, returning `undefined` for a line that is not an event. */
export function parseWorkerEvent(line: string): WorkerEvent | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  const { event, height, index, message, mfluxVersion, steps, width } = value;
  if (event === 'started' && typeof mfluxVersion === 'string') return { event, mfluxVersion };
  if (event === 'failed' && isCount(index) && typeof message === 'string') return { event, index, message };
  if (event === 'rendered' && isCount(index) && isCount(width) && isCount(height) && isCount(steps)) {
    return { event, height, index, steps, width };
  }
  return undefined;
}

// region | Helpers

/** Reports whether `value` is a non-negative integer. */
function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

// endregion | Helpers
