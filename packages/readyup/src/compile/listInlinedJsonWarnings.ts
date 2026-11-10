import { toDisplayPath } from '../portable/toDisplayPath.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import type { InlinedJsonFile } from './buildBundle.ts';

/** Returns one warning per JSON file in `inlinedJson`, each of which a kit's bundle includes whole. */
export function listInlinedJsonWarnings(kitName: string, inlinedJson: InlinedJsonFile[]): RaisedWarning[] {
  const warnings: RaisedWarning[] = [];
  for (const file of inlinedJson) {
    const importers = file.importers.map(toDisplayPath).join(', ');
    const warning: RaisedWarning = {
      code: 'json-inlined',
      message: `kit "${kitName}" bundles all of ${toDisplayPath(file.path)}, imported by ${importers}, so every field is included in the kit and any edit to the file leaves the kit stale.`,
      remedy: 'Replace the import with pickJson, which inlines only the fields that it names.',
    };
    warnings.push(warning);
  }
  return warnings;
}
