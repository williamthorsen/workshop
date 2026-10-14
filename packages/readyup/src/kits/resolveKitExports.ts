import { isRecord } from '../portable/isRecord.ts';
import { MissingChecklistsError } from './MissingChecklistsError.ts';

/**
 * Returns every recognized kit field in an imported module namespace, as a plain record.
 *
 * `checklists` is required; `defaultSeverity`, `description`, `failOn`, `fixLocation`,
 * `minReadyupVersion`, `reportOn`, and `suites` are optional. Both `export default
 * defineRdyKit({...})` and the named-export form, `export const checklists = ...`, are recognized.
 */
export function resolveKitExports(moduleRecord: Record<string, unknown>): Record<string, unknown> {
  // Unwrap default export when present (e.g., `export default defineRdyKit({...})`)
  const source = isRecord(moduleRecord['default']) ? moduleRecord['default'] : moduleRecord;

  if (source['checklists'] === undefined) {
    throw new MissingChecklistsError();
  }

  return {
    checklists: source['checklists'],
    ...(source['defaultSeverity'] !== undefined && { defaultSeverity: source['defaultSeverity'] }),
    ...(source['description'] !== undefined && { description: source['description'] }),
    ...(source['failOn'] !== undefined && { failOn: source['failOn'] }),
    ...(source['fixLocation'] !== undefined && { fixLocation: source['fixLocation'] }),
    ...(source['minReadyupVersion'] !== undefined && { minReadyupVersion: source['minReadyupVersion'] }),
    ...(source['reportOn'] !== undefined && { reportOn: source['reportOn'] }),
    ...(source['suites'] !== undefined && { suites: source['suites'] }),
  };
}
