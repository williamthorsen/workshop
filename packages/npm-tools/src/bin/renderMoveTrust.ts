import { buildGithubTrustArgs } from '../npm/createNpmClient.ts';
import { quoteShellArgs } from '../npm/quoteShellArgs.ts';
import { EXIT_FAILED, EXIT_NPM_MISSING, EXIT_OK } from './exitCodes.ts';
import type { MoveTrustOutcome, MoveTrustPlan, ReadyMoveTrustPlan, RestoreTrustOutcome } from './moveTrust.ts';
import type { RenderedOutput } from './RenderedOutput.ts';

const PERMISSION_LABELS: Readonly<Record<string, string>> = {
  createPackage: 'publish',
  createStagedPackage: 'stage publish',
};
const PREFIX = 'thor-npm move-trust:';

/**
 * Renders the outcome of a move that did not fail at the add, which `renderRestoring` reports instead.
 *
 * @internal
 */
export function renderMoveOutcome(
  plan: ReadyMoveTrustPlan,
  outcome: Exclude<MoveTrustOutcome, { kind: 'add-failed' }>,
): RenderedOutput {
  return outcome.kind === 'revoke-failed'
    ? report(EXIT_FAILED, `npm trust revoke failed (${outcome.detail}); nothing was changed`)
    : report(
        EXIT_OK,
        `moved the trusted publisher of ${plan.name} from ${plan.oldTrust.repository} to ${plan.newTrust.repository}`,
      );
}

/**
 * Renders a plan that refuses the move. A ready plan has nothing to report here.
 *
 * @internal
 */
export function renderMoveRefusal(plan: Exclude<MoveTrustPlan, { kind: 'ready' }>): RenderedOutput {
  switch (plan.kind) {
    case 'listing-failed':
      return report(
        EXIT_FAILED,
        `could not list the trusted publishers of '${plan.name}': ${plan.detail}; nothing was changed`,
      );
    case 'npm-missing':
      return report(EXIT_NPM_MISSING, 'npm not found on PATH; install Node.js with npm, then run this again');
    case 'refused':
      return report(EXIT_FAILED, `${plan.reason}; nothing was changed`);
  }
}

/**
 * Renders the line that ends a run stopped before the revoke: by a dry run, or by an answer that declined it.
 *
 * @internal
 */
export function renderMoveStop(reason: 'declined' | 'dry-run'): RenderedOutput {
  return reason === 'dry-run'
    ? report(EXIT_OK, 'nothing was changed (dry run)')
    : report(EXIT_FAILED, 'nothing was changed');
}

/**
 * Renders the summary of the move, or of the move that a dry run would make.
 *
 * @internal
 */
export function renderMoveSummary(plan: ReadyMoveTrustPlan, dryRun: boolean): string {
  const { name, newTrust, oldTrust } = plan;
  const lines = [
    ['Package', name],
    ['From', oldTrust.repository],
    ['To', newTrust.repository],
    ['Workflow', oldTrust.file === newTrust.file ? oldTrust.file : `${oldTrust.file} → ${newTrust.file}`],
    ['Environment', oldTrust.environment ?? 'none'],
    ['Permissions', oldTrust.permissions.map((permission) => PERMISSION_LABELS[permission] ?? permission).join(', ')],
    ['Mode', dryRun ? 'dry run' : 'move'],
  ].map(([label, value]) => `  ${label}: ${value}`);

  return `${lines.join('\n')}\n`;
}

/**
 * Renders the outcome of restoring the old trust, with the npm command that restores it by hand when that failed.
 *
 * @internal
 */
export function renderRestoreOutcome(plan: ReadyMoveTrustPlan, outcome: RestoreTrustOutcome): RenderedOutput {
  const { name, oldTrust } = plan;
  if (outcome.kind === 'restored') {
    return report(EXIT_FAILED, `restored the trusted publisher for ${oldTrust.repository}; nothing was moved`);
  }

  return report(
    EXIT_FAILED,
    `restoring failed (${outcome.detail}); ${name} has no trusted publisher. Restore it with:\n  ${quoteShellArgs(['npm', ...buildGithubTrustArgs(name, oldTrust)])}`,
  );
}

/**
 * Renders the line that announces the restore after a failed add.
 *
 * @internal
 */
export function renderRestoring(plan: ReadyMoveTrustPlan, detail: string): string {
  return `${PREFIX} npm trust github failed (${detail}); restoring the trusted publisher for ${plan.oldTrust.repository}\n`;
}

// region | Helpers

/** Returns one prefixed stderr line with an exit code. */
function report(exitCode: number, message: string): RenderedOutput {
  return { exitCode, stderr: `${PREFIX} ${message}\n`, stdout: '' };
}

// endregion | Helpers
