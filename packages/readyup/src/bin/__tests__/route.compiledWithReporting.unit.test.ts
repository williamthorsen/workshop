import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import { VERSION } from '../../version.ts';
import { routeCommand } from '../route.ts';

/** A kit whose single check passes, shared by every fixture here so only the stamp varies. */
const KIT_BODY = `export default { checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;

const it = test.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      {
        '.readyup/kits/current.js': buildStampedKit(VERSION),
        '.readyup/kits/stamped.js': buildStampedKit('0.19.2'),
        '.readyup/kits/unstamped.js': KIT_BODY,
      },
      { prefix: 'readyup-compiled-with-' },
    ),
  ),
);

it.aroundAll(async (runSuite, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runSuite();
});

describe('compile-time readyup version in the run report', () => {
  it('names the readyup a local bundle was built by, with no origin to nest it under', async () => {
    using io = captureStdio();

    await routeCommand(['stamped', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(parsed).toHaveProperty('kits.0.compiledWith', '0.19.2');
    expect(parsed).not.toHaveProperty('kits.0.origin');
  });

  it('names it even where it matches the runner', async () => {
    using io = captureStdio();

    await routeCommand(['current', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(parsed).toHaveProperty('kits.0.compiledWith', VERSION);
  });

  it('omits the key for a bundle carrying no stamp', async () => {
    using io = captureStdio();

    await routeCommand(['unstamped', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(parsed).toHaveProperty('kits.0.name', 'unstamped');
    expect(parsed).not.toHaveProperty('kits.0.compiledWith');
  });

  it('withholds it from a kit that loaded and then failed', async () => {
    using io = captureStdio();

    const exitCode = await routeCommand(['stamped:absent', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(exitCode).toBe(2);
    expect(parsed).toHaveProperty('kits.0.error.code', 'usage');
    expect(parsed).not.toHaveProperty('kits.0.compiledWith');
  });
});

// region | Helpers

/** Builds a kit source carrying the version stamp `rdy compile` embeds in a bundle. */
function buildStampedKit(version: string): string {
  return `export const __readyupVersion = '${version}';\n${KIT_BODY}`;
}

// endregion | Helpers
