import process from 'node:process';

/**
 * Writes human-readable prose, diverting it to stderr when JSON mode reserves stdout for its JSON document.
 *
 * Under `--json`, stdout contains exactly one JSON document, so every header, progress line, and
 * summary that a command would otherwise print has to go somewhere else.
 */
export function writeHuman(text: string, isJson: boolean): void {
  const stream = isJson ? process.stderr : process.stdout;
  stream.write(text);
}
