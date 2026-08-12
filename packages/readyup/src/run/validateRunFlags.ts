import { usageError } from '../errors/RdyError.ts';
import type { KitSpecifier } from './parseKitSpecifiers.ts';

/** The subset of parsed run flags whose combinations are constrained. */
export interface RunFlagConstraints {
  checklists: string | undefined;
  detail: string | undefined;
  file: string | undefined;
  from: string | undefined;
  internal: boolean;
  jit: boolean;
  json: boolean;
  packages: boolean;
  quiet: boolean;
  url: string | undefined;
}

/** Why checklist selection is rejected under `--packages`, whichever spelling expressed it. */
const PACKAGES_CHECKLISTS_REASON =
  'several configured packages may publish the named kit, so the checklists select within no single one';

/** Enforces output, exclusivity, mode-flag, and selection constraints. */
export function validateRunFlags(parsed: RunFlagConstraints, kitSpecifiers: KitSpecifier[]): void {
  validateOutputFlags(parsed);

  const sourceFlags = collectSourceFlags(parsed);

  if (sourceFlags.length > 1) {
    throw usageError(`Cannot combine ${sourceFlags.join(', ')} flags`);
  }

  // A positional names the kit to select in every configured package, so it narrows the run. Checklist
  // selection cannot: it names checklists within one kit, and `--packages` may reach several packages'
  // copies of the name. Both spellings of that selection are rejected for the same reason.
  if (parsed.packages && parsed.checklists !== undefined) {
    throw usageError(`--packages cannot be combined with --checklists; ${PACKAGES_CHECKLISTS_REASON}`);
  }
  const filteredSpec = kitSpecifiers.find((spec) => spec.checklists.length > 0);
  if (parsed.packages && filteredSpec !== undefined) {
    throw usageError(
      `--packages cannot be combined with the ":" checklist filter on "${filteredSpec.kitName}"; ` +
        PACKAGES_CHECKLISTS_REASON,
    );
  }

  const sourceType = sourceFlags[0];

  if (parsed.jit && sourceType !== undefined) {
    throw usageError(`--jit cannot be combined with ${sourceType}`);
  }
  if (parsed.internal && sourceType !== undefined) {
    throw usageError(`--internal cannot be combined with ${sourceType}`);
  }

  if ((sourceType === '--file' || sourceType === '--url') && kitSpecifiers.length > 0) {
    throw usageError(`${sourceType} cannot be combined with positional kit arguments`);
  }

  if (parsed.checklists !== undefined) {
    validateChecklistsSelection(sourceType, kitSpecifiers);
  }
}

// region | Helpers

/** Names the source flags this invocation carries, alphabetically, as the exclusivity error lists them. */
function collectSourceFlags(parsed: RunFlagConstraints): string[] {
  const sourceFlags: string[] = [];
  if (parsed.file !== undefined) sourceFlags.push('--file');
  if (parsed.from !== undefined) sourceFlags.push('--from');
  if (parsed.packages) sourceFlags.push('--packages');
  if (parsed.url !== undefined) sourceFlags.push('--url');
  return sourceFlags;
}

/**
 * Rejects `--checklists` when the selection it expresses is ambiguous.
 *
 * The flag names checklists within one kit, so it needs exactly one kit and no competing per-kit
 * filter. `--file` and `--url` each name their one kit implicitly; a bare invocation names the
 * default kit. Conflicting selections error rather than merging: an invocation carrying both is a
 * bug in whatever generated it, and no merge rule for "run `deploy:build`, filtered to `test`" is
 * obviously right.
 */
function validateChecklistsSelection(sourceType: string | undefined, kitSpecifiers: KitSpecifier[]): void {
  if (sourceType === '--file' || sourceType === '--url') return;

  if (kitSpecifiers.length > 1) {
    const names = kitSpecifiers.map((spec) => spec.kitName).join(', ');
    throw usageError(`--checklists requires a single kit, but ${kitSpecifiers.length} were given: ${names}`);
  }

  const spec = kitSpecifiers[0];
  if (spec !== undefined && spec.checklists.length > 0) {
    throw usageError(`--checklists cannot be combined with the ":" checklist filter on "${spec.kitName}"`);
  }
}

/**
 * Rejects an output flag that contradicts the report being emitted.
 *
 * Erroring beats ignoring: a caller that passed either flag meant to change the output, and dropping it
 * silently would leave them reading a report they did not ask for.
 */
function validateOutputFlags(parsed: RunFlagConstraints): void {
  // `--detail` selects how much of the JSON payload to emit, so it has nothing to say about the human report.
  if (parsed.detail !== undefined && !parsed.json) {
    throw usageError('--detail requires --json; it selects how much of the JSON report to emit');
  }

  // `--quiet` thins the human detail tree, which `--json` does not emit.
  if (parsed.quiet && parsed.json) {
    throw usageError('--quiet cannot be combined with --json; it hides passed lines from human output only');
  }
}

// endregion | Helpers
