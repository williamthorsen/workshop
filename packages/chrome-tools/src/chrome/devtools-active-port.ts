import fs from 'node:fs';

/** The file in which a browser started with `--remote-debugging-port=0` records the port that it chose. */
export const DEVTOOLS_ACTIVE_PORT_FILE = 'DevToolsActivePort';

/** Returns the port recorded on the first line of a profile's `DevToolsActivePort`, or `undefined` without one. */
export function readDevtoolsActivePort(profileDir: string): string | undefined {
  let content: string;
  try {
    content = fs.readFileSync(`${profileDir}/${DEVTOOLS_ACTIVE_PORT_FILE}`, 'utf8');
  } catch {
    return undefined;
  }
  return /^(\d+)(?:\n|$)/.exec(content)?.[1];
}

/**
 * Removes a profile's `DevToolsActivePort`, which a browser leaves behind after a crash, so that a launch that starts
 * the browser reads only the port that the new browser records.
 */
export function removeDevtoolsActivePort(profileDir: string): void {
  fs.rmSync(`${profileDir}/${DEVTOOLS_ACTIVE_PORT_FILE}`, { force: true });
}
