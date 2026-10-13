import process from 'node:process';

import { getLayout } from '../layout/engine.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import type { UnrunSource } from './KitSelection.ts';

/**
 * Returns what a human run prints when its `--sources` selection is empty, naming the kits that no source publishes.
 *
 * A selection with no unrun source has no cause to name, so it keeps the bare line.
 */
export function formatEmptySelection(unrunSources: readonly UnrunSource[]): string {
  const requestedNames = unrunSources[0]?.requestedNames;
  if (requestedNames === undefined) return 'No kits to run.';

  const hint =
    'Run a kit by name with `rdy run --sources <kit>`, or every kit with `rdy run --sources --all`; ' +
    '`rdy list --sources` lists the kits.';
  return [
    `No kits to run: no configured source publishes ${describeRequestedKits(requestedNames)}.`,
    getLayout().formatHint(hint),
  ].join('\n');
}

/**
 * Warns about each configured source from which a `--sources` run selected no kit.
 *
 * The stderr lines are written in both output modes; the returned entries are what JSON mode adds to the report.
 */
export function warnOnUnrunSources(unrunSources: readonly UnrunSource[]): RaisedWarning[] {
  const warnings = unrunSources.map((source) => toWarning(source));
  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
  }
  return warnings;
}

// region | Helpers

/** Names the requested kits as the object of "publishes", in the singular when one kit was requested. */
function describeRequestedKits(requestedNames: readonly string[]): string {
  return requestedNames.length === 1
    ? `a kit named ${quoteNames(requestedNames)}`
    : `any of the kits named ${quoteNames(requestedNames)}`;
}

/** Returns the kit names quoted and comma-separated. */
function quoteNames(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(', ');
}

/** Composes the warning raised by one unrun source. */
function toWarning({ spelling, requestedNames, publishedNames }: UnrunSource): RaisedWarning {
  const lacked =
    requestedNames.length === 1
      ? `no kit named ${quoteNames(requestedNames)}`
      : `none of the kits named ${quoteNames(requestedNames)}`;
  const [firstKit = '<kit>', ...otherKits] = publishedNames;
  const otherKitsSentence = otherKits.length === 0 ? '' : ` Its other kits: ${otherKits.join(', ')}.`;

  return {
    code: 'source-not-run',
    message: `configured source "${spelling}" publishes ${lacked}, so the run ran none of its kits.`,
    remedy: `Run its kits by name with \`rdy run --sources ${firstKit}\`, or every kit with \`rdy run --sources --all\`.${otherKitsSentence}`,
  };
}

// endregion | Helpers
