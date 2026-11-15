import { describe, expect, it } from 'vitest';

import { run } from '../run.ts';
import { createRunHarness } from '../test-utils/createRunHarness.ts';

describe(run, () => {
  it('reports a token command that exits non-zero as a usage error', async () => {
    const harness = createRunHarness({ env: { JIRA_EMAIL: 'someone@example.com' } });

    await expect(run(['auth', 'status', '--token-command', 'exit 7'], harness.effects)).resolves.toBe(2);
    expect(harness.readErrors()).toContain("Try 'thor-jira auth --help'.");
  });
});
