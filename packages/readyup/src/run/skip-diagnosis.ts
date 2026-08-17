import type { RdyCheck, SkipDiagnosis } from '../kits/types.ts';
import { describeUninterpretableReturn, isCheckOutcome } from './check-return.ts';

/**
 * Reports what the `check` of each skipped check would have concluded.
 *
 * Runs them concurrently, as the runner runs siblings, calling each `check` once and re-evaluating
 * no `skip`. A check that would have failed used its skip correctly and contributes nothing, so
 * every entry returned is a finding.
 */
export async function diagnoseSkips(checks: RdyCheck[]): Promise<SkipDiagnosis[]> {
  const diagnoses = await Promise.all(checks.map(diagnoseSkip));
  return diagnoses.filter((diagnosis) => diagnosis !== undefined);
}

// region | Helpers

/**
 * Diagnoses one skipped check, answering with nothing where its `check` would have failed.
 *
 * A `check` that throws, or that returns a value expressing no verdict, leaves the question
 * undecided: reporting either as a masked pass would assert something the run never established.
 */
async function diagnoseSkip(check: RdyCheck): Promise<SkipDiagnosis | undefined> {
  let raw: unknown;
  try {
    // Widened to `unknown`: a kit runs as JavaScript, so its functions return whatever their author
    // wrote, whatever the declared type promised.
    raw = await check.check();
  } catch (error_: unknown) {
    const error = error_ instanceof Error ? error_ : new Error(String(error_));
    return { name: check.name, verdict: 'inconclusive', reason: error.message };
  }

  if (typeof raw === 'boolean') return raw ? { name: check.name, verdict: 'masked-pass' } : undefined;
  if (isCheckOutcome(raw)) return raw.ok ? { name: check.name, verdict: 'masked-pass' } : undefined;

  return { name: check.name, verdict: 'inconclusive', reason: describeUninterpretableReturn(raw) };
}

// endregion | Helpers
