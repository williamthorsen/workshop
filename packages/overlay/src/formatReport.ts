import type { EntryOutcome, OverlayResult } from './types.ts';
import { pluralizeWithCount } from './utils/pluralize.ts';

/**
 * Render an `OverlayResult` as human-readable report text for stdout.
 *
 * Lists per-entry outcomes, a counts summary, the scripts summary (phrased "would run" under verify, "ran"
 * otherwise), and — when conflicts exist — a fix-it hint to re-run with `--force`. Built entirely from the structured
 * result; chezmoi's own output never reaches stdout.
 */
export function formatReport(result: OverlayResult): string {
  const lines: string[] = [];

  for (const entry of result.entries) {
    lines.push(`  ${OUTCOME_LABELS[entry.outcome]} ${entry.path}`);
  }
  if (result.entries.length > 0) {
    lines.push('');
  }

  lines.push(summarizeCounts(result), summarizeScripts(result));

  if (result.counts.conflicts > 0) {
    lines.push('', 'Conflicts left untouched. Re-run with `overlay --force` to overwrite differing files.');
  }

  return lines.join('\n');
}

const OUTCOME_LABELS: Record<EntryOutcome, string> = {
  created: 'create ',
  deleted: 'delete ',
  forced: 'force  ',
  conflict: 'conflict',
};

/** Build the counts line, phrased as pending drift under verify and as actions taken otherwise. */
function summarizeCounts(result: OverlayResult): string {
  if (result.mode === 'verify') {
    if (result.counts.pending === 0) {
      return 'Target is converged: no drift.';
    }
    return `Drift: ${pluralizeWithCount(result.counts.pending, 'entry', 'entries')}.`;
  }

  const parts = [
    result.counts.created > 0 ? `${result.counts.created} created` : undefined,
    result.counts.deleted > 0 ? `${result.counts.deleted} deleted` : undefined,
    result.counts.forced > 0 ? `${result.counts.forced} forced` : undefined,
    result.counts.conflicts > 0 ? pluralizeWithCount(result.counts.conflicts, 'conflict') : undefined,
  ].filter((part): part is string => part !== undefined);
  if (parts.length === 0) {
    return 'Nothing to do.';
  }
  return parts.join(', ') + '.';
}

/** Build the scripts-summary line, phrased "would run" under verify and "ran" otherwise. */
function summarizeScripts(result: OverlayResult): string {
  const verb = result.mode === 'verify' ? 'would run' : 'ran';
  const status = result.scripts.ok ? '' : ' (a script failed)';
  return `${pluralizeWithCount(result.scripts.ran, 'script')} ${verb}${status}.`;
}
