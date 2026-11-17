import { EXIT_FAILED, EXIT_NPM_MISSING, EXIT_OK, type RenderedOutput } from './exitCodes.ts';
import {
  PLACEHOLDER_FILES,
  PLACEHOLDER_VERSION,
  type PublishPlaceholderOutcome,
  type PublishPlaceholderPlan,
} from './publishPlaceholder.ts';

const PREFIX = 'thor-npm publish-placeholder:';

/**
 * Renders the line that ends a run stopped before the publish: by a dry run, or by an answer that declined it.
 *
 * @internal
 */
export function renderPlaceholderStop(reason: 'declined' | 'dry-run'): RenderedOutput {
  return reason === 'dry-run'
    ? report(EXIT_OK, 'nothing was published (dry run)')
    : report(EXIT_FAILED, 'nothing was published');
}

/**
 * Renders the summary of what the run publishes, or would publish under a dry run.
 *
 * @internal
 */
export function renderPlaceholderSummary(name: string, dryRun: boolean): string {
  const lines = [
    ['Package', name],
    ['Version', PLACEHOLDER_VERSION],
    ['Access', 'public'],
    ['Files', PLACEHOLDER_FILES.join(', ')],
    ['Mode', dryRun ? 'dry run' : 'publish'],
  ].map(([label, value]) => `  ${label}: ${value}`);

  return `${lines.join('\n')}\n`;
}

/**
 * Renders the outcome of the publish.
 *
 * @internal
 */
export function renderPublishOutcome(outcome: PublishPlaceholderOutcome): RenderedOutput {
  return outcome.kind === 'failed'
    ? report(EXIT_FAILED, `npm publish failed (${outcome.detail}); nothing was published`)
    : report(EXIT_OK, `published ${outcome.name}@${PLACEHOLDER_VERSION}`);
}

/**
 * Renders a plan that refuses the publish. A ready plan has nothing to report here.
 *
 * @internal
 */
export function renderPublishRefusal(plan: Exclude<PublishPlaceholderPlan, { kind: 'ready' }>): RenderedOutput {
  switch (plan.kind) {
    case 'logged-out':
      return report(EXIT_FAILED, `not logged in to npm (${plan.detail}); run npm login, then run this again`);
    case 'lookup-failed':
      return report(EXIT_FAILED, `could not query the registry for '${plan.name}': ${plan.detail}`);
    case 'name-taken':
      return report(EXIT_FAILED, `'${plan.name}' already exists on the registry; a placeholder is only for a new name`);
    case 'npm-missing':
      return report(EXIT_NPM_MISSING, 'npm not found on PATH; install Node.js with npm, then run this again');
    case 'session-failed':
      return report(EXIT_FAILED, `could not check the npm session: ${plan.detail}`);
  }
}

// region | Helpers

/** Returns one prefixed stderr line with an exit code. */
function report(exitCode: number, message: string): RenderedOutput {
  return { exitCode, stderr: `${PREFIX} ${message}\n`, stdout: '' };
}

// endregion | Helpers
