import { describe, expect, it } from 'vitest';

import { useTempDir } from '../../test-utils/tempDir.ts';
import { VERSION } from '../../version.ts';
import { routeCommand } from '../route.ts';
import { useCapturedStdio } from '../test-utils/capturedStdio.ts';

/** A kit whose single check passes, shared by every fixture here so only the stamp varies. */
const KIT_BODY = `export default { checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;

const temp = useTempDir({
  prefix: 'readyup-compiled-with-',
  cwd: 'chdir',
  scope: 'file',
  setup: () => {
    temp.write('.readyup/kits/stamped.js', buildStampedKit('0.19.2'));
    temp.write('.readyup/kits/current.js', buildStampedKit(VERSION));
    temp.write('.readyup/kits/unstamped.js', KIT_BODY);
  },
});

const io = useCapturedStdio();

describe('compile-time readyup version in the run report', () => {
  it('names the readyup a local bundle was built by, with no origin to nest it under', async () => {
    await routeCommand(['stamped', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(parsed).toHaveProperty('kits.0.compiledWith', '0.19.2');
    expect(parsed).not.toHaveProperty('kits.0.origin');
  });

  it('names it even where it matches the runner', async () => {
    await routeCommand(['current', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(parsed).toHaveProperty('kits.0.compiledWith', VERSION);
  });

  it('omits the key for a bundle carrying no stamp', async () => {
    await routeCommand(['unstamped', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(parsed).toHaveProperty('kits.0.name', 'unstamped');
    expect(parsed).not.toHaveProperty('kits.0.compiledWith');
  });

  it('withholds it from a kit that loaded and then failed', async () => {
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
