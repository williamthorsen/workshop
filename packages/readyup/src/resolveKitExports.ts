import { isRecord } from './isRecord.ts';

/**
 * Extract all recognized kit fields from an imported module namespace.
 *
 * Extracts `checklists` (required), and optionally `defaultSeverity`, `description`, `failOn`,
 * `fixLocation`, `reportOn`, and `suites`. Supports both `export default defineRdyKit({...})`
 * and the named-export convention (`export const checklists = ...`). Returns a plain record
 * suitable for passing to `assertIsRdyKit`.
 */
export function resolveKitExports(moduleRecord: Record<string, unknown>): Record<string, unknown> {
  // Unwrap default export when present (e.g., `export default defineRdyKit({...})`)
  const source = isRecord(moduleRecord.default) ? moduleRecord.default : moduleRecord;

  if (source.checklists === undefined) {
    throw new Error(
      'Kit file must export checklists (e.g., `export default defineRdyKit({ checklists: [...] })` or `export const checklists = [...]`)',
    );
  }

  return {
    checklists: source.checklists,
    ...(source.defaultSeverity !== undefined && { defaultSeverity: source.defaultSeverity }),
    ...(source.description !== undefined && { description: source.description }),
    ...(source.failOn !== undefined && { failOn: source.failOn }),
    ...(source.fixLocation !== undefined && { fixLocation: source.fixLocation }),
    ...(source.reportOn !== undefined && { reportOn: source.reportOn }),
    ...(source.suites !== undefined && { suites: source.suites }),
  };
}
