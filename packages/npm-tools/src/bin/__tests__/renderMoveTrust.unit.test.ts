import { describe, expect, it } from 'vitest';

import type { GithubTrust } from '../../npm/createNpmClient.ts';
import type { MoveTrustPlan, ReadyMoveTrustPlan } from '../moveTrust.ts';
import {
  renderMoveOutcome,
  renderMoveRefusal,
  renderMoveStop,
  renderMoveSummary,
  renderRestoreOutcome,
  renderRestoring,
} from '../renderMoveTrust.ts';

const NAME = '@scope/pkg';

const OLD_TRUST: GithubTrust = {
  environment: 'npm',
  file: 'release.yaml',
  permissions: ['createPackage', 'createStagedPackage'],
  repository: 'owner/old',
};

const PLAN: ReadyMoveTrustPlan = {
  kind: 'ready',
  id: 'trust-1',
  name: NAME,
  newTrust: { ...OLD_TRUST, repository: 'owner/new' },
  oldTrust: OLD_TRUST,
};

describe(renderMoveOutcome, () => {
  it('reports a move with exit 0', () => {
    expect(renderMoveOutcome(PLAN, { kind: 'moved' })).toStrictEqual({
      exitCode: 0,
      stderr: `thor-npm move-trust: moved the trusted publisher of ${NAME} from owner/old to owner/new\n`,
      stdout: '',
    });
  });

  it('reports a failed revoke with exit 1', () => {
    expect(renderMoveOutcome(PLAN, { kind: 'revoke-failed', detail: 'exit 1' })).toStrictEqual({
      exitCode: 1,
      stderr: 'thor-npm move-trust: npm trust revoke failed (exit 1); nothing was changed\n',
      stdout: '',
    });
  });
});

describe(renderMoveRefusal, () => {
  it.each([
    {
      plan: { kind: 'npm-missing' },
      exitCode: 127,
      message: 'npm not found on PATH; install Node.js with npm, then run this again',
    },
    {
      plan: { kind: 'listing-failed', detail: 'exit 1', name: NAME },
      exitCode: 1,
      message: `could not list the trusted publishers of '${NAME}': exit 1; nothing was changed`,
    },
    {
      plan: { kind: 'refused', reason: `'${NAME}' has more than one trusted publisher` },
      exitCode: 1,
      message: `'${NAME}' has more than one trusted publisher; nothing was changed`,
    },
  ] satisfies Array<{ plan: Exclude<MoveTrustPlan, { kind: 'ready' }>; exitCode: number; message: string }>)(
    'reports $plan.kind with exit $exitCode',
    ({ plan, exitCode, message }) => {
      expect(renderMoveRefusal(plan)).toStrictEqual({
        exitCode,
        stderr: `thor-npm move-trust: ${message}\n`,
        stdout: '',
      });
    },
  );
});

describe(renderMoveStop, () => {
  it('ends a dry run with exit 0', () => {
    expect(renderMoveStop('dry-run')).toStrictEqual({
      exitCode: 0,
      stderr: 'thor-npm move-trust: nothing was changed (dry run)\n',
      stdout: '',
    });
  });

  it('ends a declined run with exit 1', () => {
    expect(renderMoveStop('declined')).toStrictEqual({
      exitCode: 1,
      stderr: 'thor-npm move-trust: nothing was changed\n',
      stdout: '',
    });
  });
});

describe(renderMoveSummary, () => {
  it('lists the package, repositories, workflow, environment, permissions, and mode', () => {
    expect(renderMoveSummary(PLAN, false)).toBe(
      [
        `  Package: ${NAME}`,
        '  From: owner/old',
        '  To: owner/new',
        '  Workflow: release.yaml',
        '  Environment: npm',
        '  Permissions: publish, stage publish',
        '  Mode: move',
        '',
      ].join('\n'),
    );
  });

  it('shows a changed workflow, a missing environment, an unlabelled permission, and a dry run', () => {
    const { environment: _, ...oldTrust } = OLD_TRUST;
    const plan: ReadyMoveTrustPlan = {
      ...PLAN,
      newTrust: { ...oldTrust, file: 'publish.yml', repository: 'owner/new' },
      oldTrust: { ...oldTrust, permissions: ['createPackage', 'otherPermission'] },
    };

    const summary = renderMoveSummary(plan, true);

    expect(summary).toContain('  Workflow: release.yaml → publish.yml\n');
    expect(summary).toContain('  Environment: none\n');
    expect(summary).toContain('  Permissions: publish, otherPermission\n');
    expect(summary).toContain('  Mode: dry run\n');
  });
});

describe(renderRestoreOutcome, () => {
  it('reports a restore with exit 1, since nothing was moved', () => {
    expect(renderRestoreOutcome(PLAN, { kind: 'restored' })).toStrictEqual({
      exitCode: 1,
      stderr: 'thor-npm move-trust: restored the trusted publisher for owner/old; nothing was moved\n',
      stdout: '',
    });
  });

  it('prints the command that restores the old trust when the restore fails', () => {
    expect(renderRestoreOutcome(PLAN, { kind: 'failed', detail: 'signal SIGINT' })).toStrictEqual({
      exitCode: 1,
      stderr:
        `thor-npm move-trust: restoring failed (signal SIGINT); ${NAME} has no trusted publisher. Restore it with:\n` +
        `  npm trust github ${NAME} --repo owner/old --file release.yaml --env npm --allow-publish --allow-stage-publish --yes\n`,
      stdout: '',
    });
  });
});

describe(renderRestoring, () => {
  it('announces the restore after a failed add', () => {
    expect(renderRestoring(PLAN, 'exit 1')).toBe(
      'thor-npm move-trust: npm trust github failed (exit 1); restoring the trusted publisher for owner/old\n',
    );
  });
});
