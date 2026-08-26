import type { OverlayResult } from '../modes/types.ts';
import { pluralizeWithCount } from '../portable/pluralize.ts';
import { describeOutcome } from './describeOutcome.ts';

/**
 * Renders an `OverlayResult` as human-readable report text for stdout.
 *
 * Lists per-entry outcomes in an aligned label column, a counts summary, the scripts summary (phrased "would run"
 * under verify, "ran" otherwise), and a fix-it hint to re-run with `--force` whenever any entry conflicts. Built
 * entirely from the structured result; chezmoi's own output never reaches stdout.
 */
export function formatReport(result: OverlayResult): string {
  const lines: string[] = listEntries(result);
  if (result.entries.length > 0) {
    lines.push('');
  }

  lines.push(summarizeCounts(result), summarizeScripts(result));

  if (result.entries.some((entry) => entry.outcome === 'conflict')) {
    lines.push('', hintAtForce(result));
  }

  return lines.join('\n');
}

// region | Helpers

/**
 * Builds the fix-it hint, phrased in the conditional under verify, which reports a differing file without having
 * written anything.
 */
function hintAtForce(result: OverlayResult): string {
  if (result.mode === 'verify') {
    return 'Differing files would be left untouched by `--create`. Re-run with `overlay --force` to overwrite them.';
  }
  return 'Conflicts left untouched. Re-run with `overlay --force` to overwrite differing files.';
}

/** Builds the entry lines, padding each label to the widest one present so the paths align in a single column. */
function listEntries(result: OverlayResult): string[] {
  const labeled = Array.from(result.entries, (entry) => ({
    label: describeOutcome(entry.outcome, result.mode),
    path: entry.path,
  }));
  const width = Math.max(0, ...labeled.map(({ label }) => label.length));

  return labeled.map(({ label, path }) => `  ${label.padEnd(width)} ${path}`);
}

/** Builds the counts line, phrased as pending drift under verify and as actions taken otherwise. */
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

/** Builds the scripts-summary line, phrased "would run" under verify and "ran" otherwise. */
function summarizeScripts(result: OverlayResult): string {
  const verb = result.mode === 'verify' ? 'would run' : 'ran';
  const status = result.scripts.ok ? '' : ' (a script failed)';
  return `${pluralizeWithCount(result.scripts.ranCount, 'script')} ${verb}${status}.`;
}

// endregion | Helpers
