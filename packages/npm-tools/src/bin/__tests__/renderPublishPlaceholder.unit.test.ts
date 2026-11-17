import { describe, expect, it } from 'vitest';

import {
  renderPlaceholderStop,
  renderPlaceholderSummary,
  renderPublishOutcome,
  renderPublishRefusal,
} from '../renderPublishPlaceholder.ts';

const NAME = '@scope/new-pkg';

describe(renderPlaceholderStop, () => {
  it('ends a dry run with exit 0', () => {
    expect(renderPlaceholderStop('dry-run')).toStrictEqual({
      exitCode: 0,
      stderr: 'thor-npm publish-placeholder: nothing was published (dry run)\n',
      stdout: '',
    });
  });

  it('ends a declined run with exit 1', () => {
    expect(renderPlaceholderStop('declined')).toStrictEqual({
      exitCode: 1,
      stderr: 'thor-npm publish-placeholder: nothing was published\n',
      stdout: '',
    });
  });
});

describe(renderPlaceholderSummary, () => {
  it('lists the package, version, access, files, and mode', () => {
    expect(renderPlaceholderSummary(NAME, false)).toBe(
      [
        `  Package: ${NAME}`,
        '  Version: 0.0.0',
        '  Access: public',
        '  Files: package.json, README.md',
        '  Mode: publish',
        '',
      ].join('\n'),
    );
  });

  it('names the dry-run mode', () => {
    expect(renderPlaceholderSummary(NAME, true)).toContain('  Mode: dry run\n');
  });
});

describe(renderPublishOutcome, () => {
  it('reports the published version with exit 0', () => {
    expect(renderPublishOutcome({ kind: 'published', name: NAME })).toStrictEqual({
      exitCode: 0,
      stderr: `thor-npm publish-placeholder: published ${NAME}@0.0.0\n`,
      stdout: '',
    });
  });

  it('reports a failed publish with exit 1', () => {
    expect(renderPublishOutcome({ kind: 'failed', detail: 'exit 1' })).toStrictEqual({
      exitCode: 1,
      stderr: 'thor-npm publish-placeholder: npm publish failed (exit 1); nothing was published\n',
      stdout: '',
    });
  });
});

describe(renderPublishRefusal, () => {
  it.each([
    {
      plan: { kind: 'npm-missing' },
      exitCode: 127,
      message: 'npm not found on PATH; install Node.js with npm, then run this again',
    },
    {
      plan: { kind: 'logged-out', detail: 'need auth' },
      exitCode: 1,
      message: 'not logged in to npm (need auth); run npm login, then run this again',
    },
    {
      plan: { kind: 'session-failed', detail: 'request to https://registry.npmjs.org/-/whoami failed' },
      exitCode: 1,
      message: 'could not check the npm session: request to https://registry.npmjs.org/-/whoami failed',
    },
    {
      plan: { kind: 'name-taken', name: NAME },
      exitCode: 1,
      message: `'${NAME}' already exists on the registry; a placeholder is only for a new name`,
    },
    {
      plan: { kind: 'lookup-failed', detail: 'request failed', name: NAME },
      exitCode: 1,
      message: `could not query the registry for '${NAME}': request failed`,
    },
  ] as const)('reports $plan.kind with exit $exitCode', ({ exitCode, message, plan }) => {
    expect(renderPublishRefusal(plan)).toStrictEqual({
      exitCode,
      stderr: `thor-npm publish-placeholder: ${message}\n`,
      stdout: '',
    });
  });
});
