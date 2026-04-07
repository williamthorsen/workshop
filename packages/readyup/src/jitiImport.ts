import { isRecord } from './isRecord.ts';

/**
 * Import a TypeScript file via jiti with module-resolution error handling.
 *
 * Catches `MODULE_NOT_FOUND` and `ERR_MODULE_NOT_FOUND` errors and rethrows with an
 * actionable message using the caller-provided `moduleErrorDetail`. Validates the imported
 * value is a plain object, using `exportNoun` in the error message if not.
 */
export async function jitiImport(
  resolvedPath: string,
  moduleErrorDetail: string,
  exportNoun: string,
): Promise<Record<string, unknown>> {
  const { createJiti } = await import('jiti');
  const jiti = createJiti(resolvedPath);

  let imported: unknown;
  try {
    imported = await jiti.import(resolvedPath);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND')
    ) {
      const moduleMatch = error.message.match(/Cannot find (?:module|package) '([^']+)'/);
      const moduleName = moduleMatch?.[1] ?? 'unknown module';
      throw new Error(`Cannot resolve '${moduleName}'. ${moduleErrorDetail}`);
    }
    throw error;
  }

  if (!isRecord(imported)) {
    throw new Error(`${exportNoun} must export an object, got ${Array.isArray(imported) ? 'array' : typeof imported}`);
  }

  return imported;
}
