import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIN_CHEZMOI_VERSION, parseVersion } from '../chezmoi/version.ts';
import { overlay } from '../overlay.ts';

/** Detect a chezmoi binary on PATH meeting the minimum version, so integration tests skip cleanly when absent. */
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

const hasChezmoi = detectChezmoi();

const NEW_CONTENT = 'hello new\n';
const CANONICAL_CONTENT = 'canonical content\n';
const LOCAL_CONTENT = 'local differing content\n';

describe.skipIf(!hasChezmoi)('overlay against real chezmoi', () => {
  let source: string;
  let target: string;

  /** Build a chezmoi source tree with a new file, a differing file, a native removal, and a sentinel-writing run_ script. */
  async function buildConvergenceFixture(): Promise<void> {
    await writeFile(path.join(source, 'dot_newfile'), NEW_CONTENT);
    await writeFile(path.join(source, 'dot_difffile'), CANONICAL_CONTENT);
    await writeFile(path.join(source, '.chezmoiremove'), '.removeme\n');
    await writeFile(
      path.join(source, 'run_after_normalize.sh'),
      `#!/bin/sh\necho ran-normalize\nrm -f "${path.join(target, '.planted')}"\ntouch "${path.join(target, '.sentinel')}"\n`,
    );

    await writeFile(path.join(target, '.difffile'), LOCAL_CONTENT);
    await writeFile(path.join(target, '.removeme'), 'to be removed\n');
    await writeFile(path.join(target, '.planted'), 'planted\n');
  }

  beforeEach(async () => {
    source = await mkdtemp(path.join(tmpdir(), 'overlay-src-'));
    target = await mkdtemp(path.join(tmpdir(), 'overlay-dst-'));
  });

  afterEach(async () => {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  });

  it('reports A/M/D drift and exits 1 under verify on a dirty target', async () => {
    await buildConvergenceFixture();

    const result = await overlay({ source, target, mode: 'verify' });

    expect(result.exitCode).toBe(1);
    const codes = result.entries.map((entry) => entry.outcome);
    expect(codes).toContain('created');
    expect(codes).toContain('deleted');
    expect(codes).toContain('conflict');
  });

  it('creates missing files, removes native deletions, and runs the script without overwriting the differing file', async () => {
    await buildConvergenceFixture();

    const result = await overlay({ source, target, mode: 'create' });

    expect(await readFile(path.join(target, '.newfile'), 'utf8')).toBe(NEW_CONTENT);
    expect(existsSync(path.join(target, '.removeme'))).toBe(false);
    expect(await readFile(path.join(target, '.difffile'), 'utf8')).toBe(LOCAL_CONTENT);
    expect(existsSync(path.join(target, '.sentinel'))).toBe(true);
    expect(existsSync(path.join(target, '.planted'))).toBe(false);
    expect(result.counts.conflicts).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  it('overwrites the differing file under force', async () => {
    await buildConvergenceFixture();

    const result = await overlay({ source, target, mode: 'force' });

    expect(await readFile(path.join(target, '.difffile'), 'utf8')).toBe(CANONICAL_CONTENT);
    expect(result.exitCode).toBe(0);
  });

  it('stays clean (exit 0) under verify after a force, despite a pending R script', async () => {
    await buildConvergenceFixture();
    await overlay({ source, target, mode: 'force' });

    const result = await overlay({ source, target, mode: 'verify' });

    expect(result.exitCode).toBe(0);
    expect(result.scripts.ran).toBeGreaterThan(0);
  });

  it('maps a failing run_ script to exit 2 under create', async () => {
    await writeFile(path.join(source, 'dot_seed'), NEW_CONTENT);
    await writeFile(path.join(source, 'run_after_fail.sh'), '#!/bin/sh\nexit 3\n');

    const result = await overlay({ source, target, mode: 'create' });

    expect(result.exitCode).toBe(2);
    expect(result.scripts.ok).toBe(false);
  });
});
