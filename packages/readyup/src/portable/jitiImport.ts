import { isError } from '@williamthorsen/toolbelt.errors';
import type { createJiti, Jiti } from 'jiti';

import { buildInstallCommand } from './buildInstallCommand.ts';
import { isRecord } from './isRecord.ts';
import { toDisplayPath } from './toDisplayPath.ts';
import { UnresolvedModuleError } from './UnresolvedModuleError.ts';

/** Prefixes marking a specifier that names a file or an internal import rather than a package. */
const NON_PACKAGE_PREFIXES = ['.', '/', '#', 'node:'];

/** Prefixes marking a specifier that names a file by its path. */
const FILE_PREFIXES = ['.', '/'];

/**
 * Imports a TypeScript file through jiti, returning the plain object that it exports.
 *
 * A `MODULE_NOT_FOUND` or `ERR_MODULE_NOT_FOUND` failure is rethrown as an `UnresolvedModuleError`. A specifier that
 * names a file is reported as a missing file, naming the file that imports it; any other names the file being
 * evaluated and `moduleErrorDetail`, with the install command as the error's `hint`. When the imported value is not
 * a plain object, the function throws an error naming `exportNoun`. An error thrown by `options.transformSource`
 * propagates with its message unchanged.
 */
export async function jitiImport(
  resolvedPath: string,
  moduleErrorDetail: string,
  exportNoun: string,
  options: JitiImportOptions = {},
): Promise<Record<string, unknown>> {
  const { createJiti } = await import('jiti');
  const { transformSource } = options;
  const jiti =
    transformSource === undefined
      ? createJiti(resolvedPath)
      : createTransformingJiti(createJiti, resolvedPath, transformSource);

  let imported: unknown;
  try {
    imported = await jiti.import(resolvedPath);
  } catch (error: unknown) {
    if (
      isError(error) &&
      'code' in error &&
      (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND')
    ) {
      const { hint, message } = describeUnresolvedModule(error, resolvedPath, moduleErrorDetail);
      throw new UnresolvedModuleError(message, { cause: error, hint });
    }
    throw error;
  }

  if (!isRecord(imported)) {
    throw new Error(`${exportNoun} must export an object, got ${Array.isArray(imported) ? 'array' : typeof imported}`);
  }

  return imported;
}

/** Optional behavior of `jitiImport`. */
export interface JitiImportOptions {
  /**
   * Rewrites each module's source before jiti transforms it. Setting it turns off jiti's filesystem and module
   * caches, which key on the source alone and would return a stale result when the rewrite depends on another file.
   */
  transformSource?: (source: string, filename: string) => string;
}

/**
 * Returns a jiti instance that applies `transformSource` to each module's source and then jiti's own transform.
 *
 * A custom transform replaces jiti's, so a second instance supplies the default transform.
 */
function createTransformingJiti(
  create: typeof createJiti,
  resolvedPath: string,
  transformSource: (source: string, filename: string) => string,
): Jiti {
  const base = create(resolvedPath, { fsCache: false });
  return create(resolvedPath, {
    fsCache: false,
    moduleCache: false,
    transform: (transformOptions) => {
      const { filename, source } = transformOptions;
      const rewritten = filename === undefined ? source : transformSource(source, filename);
      return { code: base.transform({ ...transformOptions, source: rewritten }) };
    },
  });
}

/** What a reader is told about a specifier that jiti could not resolve. */
interface UnresolvedModuleReport {
  hint: string | undefined;
  message: string;
}

/**
 * Returns the diagnosis and remediation for a specifier that jiti could not resolve.
 *
 * A specifier that names a file is a missing file, for which neither an install nor `moduleErrorDetail` is the
 * remedy. The install command is offered only for a specifier that names a package: Installing a builtin is not
 * the remedy, and a specifier not named by jiti cannot be installed at all.
 */
function describeUnresolvedModule(
  error: Error,
  resolvedPath: string,
  moduleErrorDetail: string,
): UnresolvedModuleReport {
  const moduleName = error.message.match(/Cannot find (?:module|package) '([^']+)'/)?.[1];
  if (moduleName !== undefined && isFileSpecifier(moduleName)) {
    const importer = readImporter(error.message) ?? resolvedPath;
    return {
      hint: undefined,
      message: `Cannot find '${moduleName}', imported by ${toDisplayPath(importer)}. Check the path and the file name.`,
    };
  }

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

/** Reports whether a specifier names a file by its path. */
function isFileSpecifier(specifier: string): boolean {
  return FILE_PREFIXES.some((prefix) => specifier.startsWith(prefix));
}

/** Reports whether a specifier names an installable package rather than a file or a builtin. */
function isPackageSpecifier(specifier: string): boolean {
  return NON_PACKAGE_PREFIXES.every((prefix) => !specifier.startsWith(prefix));
}

/** Returns the module that made a failed import, which a CommonJS resolution error lists first in its require stack. */
function readImporter(message: string): string | undefined {
  return message.match(/Require stack:\n- (.+)/)?.[1];
}
