import process from 'node:process';

/**
 * Writes human-readable prose, diverting it to stderr when JSON mode owns stdout.
 *
 * Under `--json`, stdout contains exactly one JSON document, so every header, progress line, and
 * summary a command would otherwise print has to go somewhere else.
 */
export function writeHuman(text: string, json: boolean): void {
  const stream = json ? process.stderr : process.stdout;
  stream.write(text);
}
