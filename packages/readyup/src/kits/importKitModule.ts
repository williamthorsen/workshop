import { pathToFileURL } from 'node:url';

import { isRecord } from '../portable/isRecord.ts';

/** Query parameter by which the runner's module hook recognizes a kit import and loads it as an ES module. */
export const KIT_IMPORT_PARAM = 'rdy-kit';

/** Returns the URL through which a kit file is imported: marked as a kit, and unique so that a reimport re-evaluates. */
export function buildKitImportUrl(filePath: string): string {
  return `${pathToFileURL(filePath).href}?${KIT_IMPORT_PARAM}&t=${Date.now()}`;
}

/** Imports a kit file as an ES module, whatever `type` its nearest `package.json` declares, and returns its exports. */
export async function importKitModule(filePath: string): Promise<Record<string, unknown>> {
  const imported: unknown = await import(buildKitImportUrl(filePath));
  return isRecord(imported) ? imported : {};
}
