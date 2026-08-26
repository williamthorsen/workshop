import process from 'node:process';

import { describeKitOwner } from '../kits/describeKitOwner.ts';
import type { KitProvenance } from '../kits/KitProvenance.ts';
import type { RdyCheck, SkipDiagnosis } from '../kits/types.ts';
import { toError } from '../portable/toError.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import { describeUninterpretableReturn, isCheckOutcome, resolveCheckReturn } from './check-return.ts';
import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';

/**
 * Reports what the `check` of each skipped check would have concluded.
 *
 * Runs them concurrently, as the runner runs siblings, calling each `check` once and re-evaluating
 * no `skip`. A check that would have failed used its skip correctly and contributes nothing, so
 * every entry returned is a finding.
 */
export async function diagnoseSkips(checks: RdyCheck[], provenance?: KitProvenance): Promise<SkipDiagnosis[]> {
  const diagnoses = await Promise.all(checks.map((check) => diagnoseSkip(check, provenance)));
  return diagnoses.filter((diagnosis) => diagnosis !== undefined);
}

/**
 * Emits an advisory stderr warning for each diagnosed skip, and returns the entries.
 *
 * `skip-masks-pass` says the skip suppressed a pass, which is the condition `--diagnose` exists to
 * expose. `diagnosis-inconclusive` says the check reached no verdict, so the run established
 * nothing about that skip either way; the two are separate codes because a consumer branching on
 * one must never read the other as a masked pass.
 *
 * Mirrors `warnOnKitStaleness`: the stderr lines are written in both output modes, and the returned
 * entries are what JSON mode captures into the report for a consumer that owns only stdout. Unlike
 * that family, these are check-derived rather than manifest-derived, so no kit source silences them.
 */
export function warnOnMaskedSkips(
  entry: ResolvedKitEntry,
  checklistName: string,
  diagnoses: SkipDiagnosis[] | undefined,
): RaisedWarning[] {
  if (diagnoses === undefined) return [];

  const warnings = diagnoses.map((diagnosis) => toWarning(entry, checklistName, diagnosis));
  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
  }
  return warnings;
}

// region | Helpers

/**
 * Names the check a warning is about, down to the checklist that holds it.
 *
 * A masked pass is a property of one check where the staleness advisories are properties of a kit,
 * and one run may have many of both, so the check's name alone would not say which line to look at.
 */
function describeCheck(entry: ResolvedKitEntry, checklistName: string, name: string): string {
  const kit = `kit "${entry.name}"${describeKitOwner(entry.provenance)}`;
  return `skipped check "${name}" in ${kit} / checklist "${checklistName}"`;
}

/**
 * Diagnoses one skipped check, returning `undefined` where its `check` would have failed.
 *
 * A `check` that throws, one whose findings cannot be read, or one returning a value expressing no
 * verdict leaves the question undecided: reporting any of them as a masked pass would assert something
 * the run never established. Resolving the return value sits inside the guard for that reason, as it
 * does in the runner.
 *
 * Nothing here reaches a ledger. The resolution is passed none, and the check runs outside the scope the runner
 * opens around a live one, so a sweep it reads here reports to nobody. A sweep it read in its live `skip` was
 * recorded then and stands: what this diagnosis adds is nothing, not what the check contributed while running.
 */
async function diagnoseSkip(
  check: RdyCheck,
  provenance: KitProvenance | undefined,
): Promise<SkipDiagnosis | undefined> {
  let raw: unknown;
  let outcome: unknown;
  try {
    // Widened to `unknown`: a kit runs as JavaScript, so its functions return whatever their author
    // wrote, whatever the declared type promised.
    raw = await check.check();
    outcome = resolveCheckReturn(raw, check, provenance);
  } catch (error_: unknown) {
    const error = toError(error_);
    return { name: check.name, verdict: 'inconclusive', reason: error.message };
  }

  if (typeof outcome === 'boolean') return outcome ? { name: check.name, verdict: 'masked-pass' } : undefined;
  if (isCheckOutcome(outcome)) return outcome.ok ? { name: check.name, verdict: 'masked-pass' } : undefined;

  return { name: check.name, verdict: 'inconclusive', reason: describeUninterpretableReturn(raw) };
}

/** Composes the warning one diagnosis raises. */
function toWarning(entry: ResolvedKitEntry, checklistName: string, diagnosis: SkipDiagnosis): RaisedWarning {
  const subject = describeCheck(entry, checklistName, diagnosis.name);

  if (diagnosis.verdict === 'masked-pass') {
    return {
      code: 'skip-masks-pass',
      message: `${subject} would have passed.`,
      remedy: 'Narrow its skip to the states where the check would fail, or remove the skip.',
    };
  }

  return {
    code: 'diagnosis-inconclusive',
    message: `${subject} could not be diagnosed: ${trimTrailingPeriod(diagnosis.reason)}.`,
    remedy: 'Fix the check so it returns a verdict, then re-run with --diagnose.',
  };
}

/** Trims a reason's trailing period, so the sentence around it ends with exactly one. */
function trimTrailingPeriod(reason: string): string {
  return reason.endsWith('.') ? reason.slice(0, -1) : reason;
}

// endregion | Helpers
