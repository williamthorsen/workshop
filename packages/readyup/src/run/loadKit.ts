import { describeError, isError } from '@williamthorsen/toolbelt.errors';

import { extractHint } from '../errors/error-handling.ts';
import { kitLoadError, type RdyError } from '../errors/RdyError.ts';
import { describeUnresolvableImports } from '../kitImports/describeUnresolvableImports.ts';
import { UnresolvableKitImportsError } from '../kitImports/UnresolvableKitImportsError.ts';
import { type LoadedRdyKit, loadRdyKit } from '../kits/loadRdyKit.ts';
import { loadRemoteKit, type LoadRemoteKitOptions } from '../remote/loadRemoteKit.ts';
import { resolveRemoteAuthHeaders, resolveRemoteProvider } from '../remote/remote-provider.ts';
import { toRemoteRdyError } from '../remote/toRemoteRdyError.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';

/**
 * Loads a rdy kit from a path or URL source.
 *
 * Takes the whole entry rather than its source alone: a kit whose readyup imports the runner cannot satisfy is
 * reported with a remedy chosen from the kit's provenance, which the source by itself does not carry.
 */
export async function loadKit(entry: ResolvedKitEntry, isJit: boolean): Promise<LoadedRdyKit> {
  const { source } = entry;

  if ('url' in source) {
    const provider = resolveRemoteProvider(source.url);
    const headers = resolveRemoteAuthHeaders(provider);
    const options: LoadRemoteKitOptions = { url: source.url, ...(headers !== undefined && { headers }) };

    try {
      return await loadRemoteKit(options);
    } catch (error: unknown) {
      // Catch ahead of the remote wrapper: a kit that fetched cleanly and binds symbols the runner lacks is a
      // diagnosis about the kit, and reshaping it as a fetch failure would name the wrong thing.
      if (error instanceof UnresolvableKitImportsError) throw toUnresolvableImportsError(error, entry);
      throw toRemoteRdyError(error, {
        code: 'kit-load',
        provider,
        tokenForwarded: headers !== undefined,
        url: source.url,
      });
    }
  }

  try {
    return await loadRdyKit(source.path);
  } catch (error: unknown) {
    if (error instanceof UnresolvableKitImportsError) throw toUnresolvableImportsError(error, entry);
    if (isJit && isModuleNotFoundError(error, 'readyup')) {
      throw kitLoadError('Running from source requires readyup to be installed as a project dependency.', {
        cause: error,
      });
    }
    throw kitLoadError(describeError(error), { cause: error, hint: extractHint(error) });
  }
}

// region | Helpers

/** Detects module-not-found errors that mention a specific package name. */
function isModuleNotFoundError(error: unknown, packageName: string): boolean {
  if (!isError(error)) return false;
  if (!('code' in error)) return false;
  if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_MODULE_NOT_FOUND') return false;
  return error.message.includes(packageName);
}

/** Turns unresolvable readyup imports into the kit-load failure a reader sees, named for where the kit came from. */
function toUnresolvableImportsError(error: UnresolvableKitImportsError, entry: ResolvedKitEntry): RdyError {
  const { hint, message } = describeUnresolvableImports(error.findings, {
    kitName: entry.name,
    provenance: entry.provenance,
  });
  return kitLoadError(message, { cause: error, hint });
}

// endregion | Helpers
