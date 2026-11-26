import { type Invocation, refuse } from './invocation.ts';

/** A wall-clock budget read from the environment, with the text by which messages name it. */
export interface Timeout {
  seconds: number;
  text: string;
}

/** How long a launch waits for the DevTools endpoint when `THOR_CHROME_LAUNCH_TIMEOUT` is unset. */
export const DEFAULT_LAUNCH_TIMEOUT_SECONDS = 10;

/** Reads the launch budget, within which a launch and the DevTools proxy wait for the browser's endpoint. */
export function readLaunchTimeout(invocation: Invocation): Timeout {
  return readTimeoutSeconds(invocation, 'THOR_CHROME_LAUNCH_TIMEOUT', DEFAULT_LAUNCH_TIMEOUT_SECONDS);
}

/**
 * Reads a timeout from an environment variable, else the default, refusing one that is not a whole number of seconds,
 * which the elapsed-time comparison requires.
 */
export function readTimeoutSeconds(invocation: Invocation, variable: string, defaultSeconds: number): Timeout {
  const text = invocation.deps.env[variable] || String(defaultSeconds);
  if (!/^\d+$/.test(text) || Number(text) < 1) {
    throw refuse(invocation, 'invalid-timeout', `invalid ${variable}: ${text} (whole seconds, 1 or more)`);
  }
  return { seconds: Number(text), text };
}
