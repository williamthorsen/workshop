import path from 'node:path';
import process from 'node:process';

import type { RaisedWarning } from '../schemas/common.ts';
import type { InlinedJsonFile } from './buildBundle.ts';

/**
 * Warns that a kit's bundle includes each JSON file in `inlinedJson` whole, and returns one warning per file.
 *
 * The stderr line is written in both output modes; the returned entries are what JSON mode adds to the payload.
 */
export function warnOnInlinedJson(kitName: string, inlinedJson: InlinedJsonFile[]): RaisedWarning[] {
  const warnings: RaisedWarning[] = [];
  for (const file of inlinedJson) {
    const importers = file.importers.map(toDisplayPath).join(', ');
    const warning: RaisedWarning = {
      code: 'json-inlined',
      message: `kit "${kitName}" bundles all of ${toDisplayPath(file.path)}, imported by ${importers}, so every field is included in the kit and any edit to the file leaves the kit stale.`,
      remedy: 'Replace the import with pickJson, which inlines only the fields that it names.',
    };
    process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
    warnings.push(warning);
  }
  return warnings;
}

// region | Helpers

/** Returns a path relative to the working directory. */
function toDisplayPath(filePath: string): string {
  return path.relative(process.cwd(), filePath);
}

// endregion | Helpers
