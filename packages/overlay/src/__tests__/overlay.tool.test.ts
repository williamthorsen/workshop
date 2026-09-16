import { execFileSync } from 'node:child_process';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { MIN_CHEZMOI_VERSION, parseVersion } from '../chezmoi/version.ts';
import { overlay } from '../overlay.ts';

const hasChezmoi = detectChezmoi();

const NEW_CONTENT = 'hello new\n';
const CANONICAL_CONTENT = 'canonical content\n';
const LOCAL_CONTENT = 'local differing content\n';

const it = baseIt
  .extend(
    'source',
    makeFixture(() => createTempTree({}, { prefix: 'overlay-src-' })),
  )
  .extend(
    'target',
    makeFixture(() => createTempTree({}, { prefix: 'overlay-dst-' })),
  );

describe.skipIf(!hasChezmoi)('overlay against real chezmoi', () => {
  it('reports A/M/D drift and exits 1 under verify on a dirty target', async ({ source, target }) => {
    buildConvergenceFixture(source, target);

    const result = await overlay({ source: source.dir, target: target.dir, mode: 'verify' });

    expect(result.exitCode).toBe(1);
    const codes = result.entries.map((entry) => entry.outcome);
    expect(codes).toContain('created');
    expect(codes).toContain('deleted');
    expect(codes).toContain('conflict');
  });

  it('creates missing files, removes native deletions, and runs the script without overwriting the differing file', async ({
    source,
    target,
  }) => {
    buildConvergenceFixture(source, target);

    const result = await overlay({ source: source.dir, target: target.dir, mode: 'create' });

    expect(target.read('.newfile')).toBe(NEW_CONTENT);
    expect(target.exists('.removeme')).toBe(false);
    expect(target.read('.difffile')).toBe(LOCAL_CONTENT);
    expect(target.exists('.sentinel')).toBe(true);
    expect(target.exists('.planted')).toBe(false);
    expect(result.counts.conflicts).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  it('overwrites the differing file under force', async ({ source, target }) => {
    buildConvergenceFixture(source, target);

    const result = await overlay({ source: source.dir, target: target.dir, mode: 'force' });

    expect(target.read('.difffile')).toBe(CANONICAL_CONTENT);
    expect(target.exists('.sentinel')).toBe(true);
    expect(target.exists('.planted')).toBe(false);
    expect(result.scripts.ranCount).toBeGreaterThan(0);
    expect(result.exitCode).toBe(0);
  });

  it('stays clean (exit 0) under verify after a force, despite a pending R script', async ({ source, target }) => {
    buildConvergenceFixture(source, target);
    await overlay({ source: source.dir, target: target.dir, mode: 'force' });

    const result = await overlay({ source: source.dir, target: target.dir, mode: 'verify' });

    expect(result.exitCode).toBe(0);
    expect(result.scripts.ranCount).toBeGreaterThan(0);
  });

  it('maps a failing run_ script to exit 2 under create', async ({ source, target }) => {
    source.write('dot_seed', NEW_CONTENT);
    source.write('run_after_fail.sh', '#!/bin/sh\nexit 3\n');

    const result = await overlay({ source: source.dir, target: target.dir, mode: 'create' });

    expect(result.exitCode).toBe(2);
    expect(result.scripts.ok).toBe(false);
  });
});

// region | Helpers

/**
 * Builds a chezmoi source tree with a new file, a differing file, a native removal, and a sentinel-writing
 * run_ script.
 */
function buildConvergenceFixture(source: TempTree, target: TempTree): void {
  source.writeAll({
    '.chezmoiremove': '.removeme\n',
    dot_difffile: CANONICAL_CONTENT,
    dot_newfile: NEW_CONTENT,
    'run_after_normalize.sh': `#!/bin/sh\necho ran-normalize\nrm -f "${target.resolve('.planted')}"\ntouch "${target.resolve('.sentinel')}"\n`,
  });

  target.writeAll({
    '.difffile': LOCAL_CONTENT,
    '.planted': 'planted\n',
    '.removeme': 'to be removed\n',
  });
}

/** Detects a chezmoi binary on PATH meeting the minimum version, so these tests skip cleanly when absent. */
function detectChezmoi(): boolean {
  try {
    const output = execFileSync('chezmoi', ['--version'], { encoding: 'utf8' });
    const installed = parseVersion(output);
    const minimum = parseVersion(MIN_CHEZMOI_VERSION);
    if (installed === undefined || minimum === undefined) return false;
    if (installed.major !== minimum.major) return installed.major > minimum.major;
    if (installed.minor !== minimum.minor) return installed.minor > minimum.minor;
    return installed.patch >= minimum.patch;
  } catch {
    return false;
  }
}

// endregion | Helpers
