import { usageError } from '../errors/RdyError.ts';
import type { KitSpecifier } from './parseKitSpecifiers.ts';

/** The subset of parsed run flags whose combinations are constrained. */
export interface RunFlagConstraints {
  all: boolean;
  checklists: string | undefined;
  config: string | undefined;
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

  if (parsed.all) {
    validateAllSelection(parsed, kitSpecifiers);
  }

  // A positional narrows the run: It names the kit to select in every configured package. Checklist
  // selection cannot: It names checklists within one kit, and `--packages` may select that kit in several
  // packages. Both spellings of that selection are rejected for the same reason.
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

  // `--packages` is the one source that reads config: The config names the packages that it runs.
  if (parsed.config !== undefined && sourceType !== undefined && sourceType !== '--packages') {
    throw usageError(`--config cannot be combined with ${sourceType}, which reads no config`);
  }

  if ((sourceType === '--file' || sourceType === '--url') && kitSpecifiers.length > 0) {
    throw usageError(`${sourceType} cannot be combined with positional kit arguments`);
  }

  if (parsed.checklists !== undefined) {
    validateChecklistsSelection(sourceType, kitSpecifiers);
  }
}

// region | Helpers

/** Names the source flags present in this invocation, alphabetically, as the exclusivity error lists them. */
function collectSourceFlags(parsed: RunFlagConstraints): string[] {
  const sourceFlags: string[] = [];
  if (parsed.file !== undefined) sourceFlags.push('--file');
  if (parsed.from !== undefined) sourceFlags.push('--from');
  if (parsed.packages) sourceFlags.push('--packages');
  if (parsed.url !== undefined) sourceFlags.push('--url');
  return sourceFlags;
}

/** Rejects a selection that contradicts `--all`, which selects every kit in the source rather than a single kit. */
function validateAllSelection(parsed: RunFlagConstraints, kitSpecifiers: KitSpecifier[]): void {
  if (parsed.file !== undefined) {
    throw usageError('--all cannot be combined with --file; --file names a single kit');
  }
  if (parsed.url !== undefined) {
    throw usageError('--all cannot be combined with --url; --url names a single kit');
  }
  if (kitSpecifiers.length > 0) {
    const names = kitSpecifiers.map((spec) => spec.kitName).join(', ');
    throw usageError(`--all cannot be combined with kit names (given: ${names}); it selects every kit in the source`);
  }
  if (parsed.checklists !== undefined) {
    throw usageError('--all cannot be combined with --checklists; checklists select within a single kit');
  }
}

/**
 * Rejects `--checklists` when the selection that it expresses is ambiguous.
 *
 * The flag names checklists within one kit, so it needs exactly one kit and no competing per-kit
 * filter. `--file` and `--url` each name their one kit implicitly; a bare invocation names the
 * default kit. Conflicting selections error rather than merging: An invocation giving both is a
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
 * Rejecting a flag is better than ignoring it: A caller that passed either flag meant to change the output, and
 * dropping it silently would leave them reading a report that they did not ask for.
 */
function validateOutputFlags(parsed: RunFlagConstraints): void {
  // `--detail` selects how much of the JSON payload to emit, so it does not apply to the human report.
  if (parsed.detail !== undefined && !parsed.json) {
    throw usageError('--detail requires --json; it selects how much of the JSON report to emit');
  }

  // `--quiet` hides passed lines in the human detail tree, which `--json` does not emit.
  if (parsed.quiet && parsed.json) {
    throw usageError('--quiet cannot be combined with --json; it hides passed lines from human output only');
  }
}

// endregion | Helpers
