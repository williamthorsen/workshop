import { describe, expect } from 'vitest';

import { routeCommand } from '../src/bin/route.ts';
import { type CapturedStdio, createStdioFixture } from './helpers/capturedStdio.ts';
import { createTempDirTest } from './helpers/tempDir.ts';

/** A kit with one passing check and one failing check that carries a fix. */
const MIXED_KIT =
  `export default { checklists: [{ name: 'main', checks: [\n` +
  `  { name: 'clean', check: () => true },\n` +
  `  { name: 'nope', check: () => false, fix: 'do the thing' },\n` +
  `] }] };\n`;

const it = createTempDirTest({
  prefix: 'readyup-detail-',
  cwd: 'chdir',
  scope: 'file',
  setup: (temp) => temp.write('.readyup/kits/default.js', MIXED_KIT),
}).extend<{ io: CapturedStdio }>({ io: createStdioFixture() });

describe('--detail projection', () => {
  it('defaults to the full tree, echoing the projection it used', async ({ io }) => {
    await routeCommand(['--json']);

    expect(JSON.parse(io.stdout)).toMatchObject({
      detail: 'full',
      kits: [{ checklists: [{ checks: [{ name: 'clean' }, { name: 'nope' }] }] }],
    });
  });

  it('reduces the tree to failed checks and their fixes under summary', async ({ io }) => {
    await routeCommand(['--json', '--detail', 'summary']);

    expect(JSON.parse(io.stdout)).toMatchObject({
      detail: 'summary',
      counts: { passed: 1, errors: 1 },
      worstSeverity: 'error',
      kits: [{ checklists: [{ checks: [{ name: 'nope', fix: 'do the thing' }] }] }],
    });
    expect(io.stdout).not.toContain('clean');
  });

  it('reports --detail without --json as a usage error rather than ignoring it', async ({ io }) => {
    const exitCode = await routeCommand(['--detail', 'summary']);

    expect(exitCode).toBe(2);
    expect(io.stdout).toBe('');
    expect(io.stderr).toContain('--detail requires --json');
  });

  it.for(['compile', 'init', 'list', 'verify'])('reports --detail on %s as a usage error', async (command, { io }) => {
    const exitCode = await routeCommand([command, '--detail', 'summary', '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stdout)).toMatchObject({ error: { code: 'usage' } });
  });
});
