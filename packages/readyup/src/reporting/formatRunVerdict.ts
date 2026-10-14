import { pluralizeWithCount } from '@williamthorsen/toolbelt.strings';

import type { Severity } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';

/** The failure threshold under which one kit of the run was judged. */
export interface KitThreshold {
  failOn: Severity;
  kitName: string;
}

/** Failing checks that the reporting threshold kept out of the report, and the threshold that would show them all. */
export interface WithheldFailures {
  count: number;
  showAt: Severity;
}

/** What a run's verdict block reports. */
export interface RunVerdictInput {
  /** Thresholds of the kits that ran, in run order. */
  kitThresholds: KitThreshold[];
  /** Kits that the invocation selected but that never ran. */
  missingKitCount: number;
  passed: boolean;
  withheld: WithheldFailures | undefined;
}

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warn', 'recommend'];

/**
 * Returns the block closing a human run: a hint naming any withheld failing checks, then the verdict line.
 *
 * A kit that never ran outranks every check outcome, so an incomplete run states that rather than a pass or a
 * failure, and names no threshold because none decided it.
 */
export function formatRunVerdict({ kitThresholds, missingKitCount, passed, withheld }: RunVerdictInput): string {
  const layout = getLayout();
  const lines: string[] = [];

  if (withheld !== undefined && withheld.count > 0) {
    const subject =
      withheld.count === 1 ? '1 failing check is not shown' : `${withheld.count} failing checks are not shown`;
    const pronoun = withheld.count === 1 ? 'it' : 'them';
    lines.push(layout.formatHint(`${subject}; rerun with --report-on ${withheld.showAt} to show ${pronoun}`));
  }

  if (missingKitCount > 0) {
    lines.push(
      `${layout.token('failedError')}Run incomplete: ${pluralizeWithCount(missingKitCount, 'kit')} did not run`,
    );
  } else {
    const verdict = passed ? `${layout.token('passed')}Run passed` : `${layout.token('failedError')}Run failed`;
    lines.push(kitThresholds.length > 0 ? `${verdict} (fail-on: ${describeThresholds(kitThresholds)})` : verdict);
  }

  return lines.join('\n');
}

// region | Helpers

/**
 * Returns the threshold alone when every kit shares it, or else each threshold followed by its kits, most
 * severe first.
 */
function describeThresholds(kitThresholds: KitThreshold[]): string {
  const distinct = SEVERITY_ORDER.filter((severity) => kitThresholds.some(({ failOn }) => failOn === severity));
  if (distinct.length === 1) return distinct.join('');

  return distinct
    .map((severity) => {
      const kitNames = kitThresholds.filter(({ failOn }) => failOn === severity).map(({ kitName }) => kitName);
      return `${severity} for ${kitNames.join(', ')}`;
    })
    .join('; ');
}

// endregion | Helpers
