import { toDisplayPath } from '../utils/display-path.ts';
import { buildInstallCommand } from '../utils/install-command.ts';
import { isRecord } from './isRecord.ts';

/** Prefixes marking a specifier that names a file or an internal import rather than a package. */
const NON_PACKAGE_PREFIXES = ['.', '/', '#', 'node:'];

/**
 * Import a TypeScript file via jiti with module-resolution error handling.
 *
 * Catches `MODULE_NOT_FOUND` and `ERR_MODULE_NOT_FOUND` errors and rethrows naming the file being
 * evaluated and the caller-provided `moduleErrorDetail`, with the install command carried as a
 * `hint` property beside the message. The hint rides on the error rather than being raised as a
 * typed failure here, because the two callers classify the same failure under different codes.
 * Validates the imported value is a plain object, using `exportNoun` in the error message if not.
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
      const { hint, message } = describeUnresolvedModule(error, resolvedPath, moduleErrorDetail);
      const unresolved = new Error(message, { cause: error });
      if (hint !== undefined) Object.assign(unresolved, { hint });
      throw unresolved;
    }
    throw error;
  }

  if (!isRecord(imported)) {
    throw new Error(`${exportNoun} must export an object, got ${Array.isArray(imported) ? 'array' : typeof imported}`);
  }

  return imported;
}

/** What a reader is told about a specifier jiti could not resolve. */
interface UnresolvedModuleReport {
  hint: string | undefined;
  message: string;
}

/**
 * Compose the diagnosis and remediation for a specifier jiti could not resolve.
 *
 * The install command is offered only for a specifier that names a package: installing a relative
 * import or a builtin is not the remedy, and a specifier jiti did not name cannot be installed at all.
 */
function describeUnresolvedModule(
  error: Error,
  resolvedPath: string,
  moduleErrorDetail: string,
): UnresolvedModuleReport {
  const moduleName = error.message.match(/Cannot find (?:module|package) '([^']+)'/)?.[1];
  const subject = moduleName ?? 'unknown module';
  const hint =
    moduleName !== undefined && isPackageSpecifier(moduleName)
      ? `Install it with: ${buildInstallCommand(moduleName)}`
      : undefined;

  return {
    hint,
    message: `Cannot resolve '${subject}' while evaluating ${toDisplayPath(resolvedPath)}. ${moduleErrorDetail}`,
  };
}

/** Report whether a specifier names an installable package rather than a file or a builtin. */
function isPackageSpecifier(specifier: string): boolean {
  return NON_PACKAGE_PREFIXES.every((prefix) => !specifier.startsWith(prefix));
}
