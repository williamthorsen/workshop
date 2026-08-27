import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { routeCommand } from '../route.ts';

/** A kit with one passing check and one failing check that has a fix. */
const MIXED_KIT =
  `export default { checklists: [{ name: 'main', checks: [\n` +
  `  { name: 'clean', check: () => true },\n` +
  `  { name: 'nope', check: () => false, fix: 'do the thing' },\n` +
  `] }] };\n`;

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() => createTempTree({ '.readyup/kits/default.js': MIXED_KIT }, { prefix: 'readyup-detail-' })),
);

it.aroundAll(async (runSuite, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runSuite();
});

describe('--detail projection', () => {
  it('defaults to the full tree, echoing the projection it used', async () => {
    using io = captureStdio();

    await routeCommand(['--json']);

    expect(JSON.parse(io.stdout)).toMatchObject({
      detail: 'full',
      kits: [{ checklists: [{ checks: [{ name: 'clean' }, { name: 'nope' }] }] }],
    });
  });

  it('reduces the tree to failed checks and their fixes under summary', async () => {
    using io = captureStdio();

    await routeCommand(['--json', '--detail', 'summary']);

    expect(JSON.parse(io.stdout)).toMatchObject({
      detail: 'summary',
      counts: { passed: 1, errors: 1 },
      worstSeverity: 'error',
      kits: [{ checklists: [{ checks: [{ name: 'nope', fix: 'do the thing' }] }] }],
    });
    expect(io.stdout).not.toContain('clean');
  });

  it('reports --detail without --json as a usage error rather than ignoring it', async () => {
    using io = captureStdio();

    const exitCode = await routeCommand(['--detail', 'summary']);

    expect(exitCode).toBe(2);
    expect(io.stdout).toBe('');
    expect(io.stderr).toContain('--detail requires --json');
  });

  it.for(['compile', 'init', 'list', 'verify'])('reports --detail on %s as a usage error', async (command) => {
    using io = captureStdio();

    const exitCode = await routeCommand([command, '--detail', 'summary', '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stdout)).toMatchObject({ error: { code: 'usage' } });
  });
});
