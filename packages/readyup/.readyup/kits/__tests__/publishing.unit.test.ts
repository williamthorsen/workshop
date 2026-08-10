import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RdyResult } from '../../../src/kits/types.ts';
import { pickResult, runChecklist } from '../test-utils/checklist-results.ts';
import { loadOwnKit } from '../test-utils/loadOwnKit.ts';
import { FIXTURE_KITS_DIR, writeKit, writeKitManifest, writePackageJson } from '../test-utils/project-fixture.ts';

/** Bundle reaching for a package that only the publishing project has installed. */
const LEAKY_BUNDLE = 'import picomatch from "picomatch";\nexport default { checklists: [] };\n';

/**
 * Covers the `publishing` kit readyup publishes, against fixture projects in a temp directory.
 *
 * Each test builds the package it wants judged -- its `files` allowlist, its manifest, its bundles --
 * and moves there before loading the kit, because every check the kit runs is relative to the
 * working directory.
 */
describe('publishing kit', () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'kit-publishing-'));
    originalCwd = process.cwd();
    process.chdir(projectRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  });

  describe('packaging', () => {
    it('passes a package whose allowlist ships the kit directory', async () => {
      writePublishablePackage(projectRoot);

      const results = await runPackaging();

      expect(results.map((result) => result.status)).toStrictEqual(['passed', 'passed', 'passed', 'passed']);
    });

    // Nothing is held back, so nothing has to be listed.
    it('accepts a package that declares no allowlist', async () => {
      writePublishablePackage(projectRoot, {});

      const results = await runPackaging();

      expect(pickResult(results, 'allowlist')).toMatchObject({ status: 'passed' });
    });

    it('accepts an allowlist naming the package root', async () => {
      writePublishablePackage(projectRoot, { files: ['.'] });

      const results = await runPackaging();

      expect(pickResult(results, 'allowlist')).toMatchObject({ status: 'passed', detail: '"files" lists .' });
    });

    // npm reads these as the same entry, so the check has to as well.
    it('accepts the kit directory however it is spelled', async () => {
      writePublishablePackage(projectRoot, { files: ['./.readyup/'] });

      const results = await runPackaging();

      expect(pickResult(results, 'allowlist')).toMatchObject({ status: 'passed', detail: '"files" lists .readyup' });
    });

    it('reports an allowlist that omits the kit directory', async () => {
      writePublishablePackage(projectRoot, { files: ['dist'] });

      const results = await runPackaging();

      expect(pickResult(results, 'allowlist')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('.readyup'),
      });
    });

    it('reports an allowlist that is not a list', async () => {
      writePublishablePackage(projectRoot, { files: '.readyup' });

      const results = await runPackaging();

      expect(pickResult(results, 'allowlist')).toMatchObject({ status: 'failed', detail: '"files" is not an array' });
    });

    it('reports a package with no manifest of record', async () => {
      writeKitManifest(projectRoot, [writeKit(projectRoot, 'default')]);

      const results = await runPackaging();

      expect(pickResult(results, 'allowlist')).toMatchObject({
        status: 'failed',
        detail: 'package.json is missing or unreadable',
      });
    });

    // A tarball without it publishes kits no consumer can discover without running them.
    it('reports a missing manifest', async () => {
      writePackageJson(projectRoot, { files: ['.readyup'] });
      writeKit(projectRoot, 'default');

      const results = await runPackaging();

      expect(pickResult(results, 'manifest.json')).toMatchObject({ status: 'failed' });
    });

    // `default` stands down for a project that defines no kits; a package that ships them and has none
    // is broken, so this kit keeps reading the absence as an error.
    it('reports a package holding no kit directory at all', async () => {
      writePackageJson(projectRoot, { files: ['.readyup'] });

      const results = await runPackaging();

      expect(pickResult(results, 'manifest.json')).toMatchObject({ status: 'failed', severity: 'error' });
    });

    // Publishing only named kits is legitimate, but a consumer's first invocation is a bare one.
    it('reports a missing default kit without blocking the publish', async () => {
      writePublishablePackage(projectRoot, { files: ['.readyup'] }, 'release');

      const results = await runPackaging();

      expect(pickResult(results, 'default.js')).toMatchObject({ status: 'failed', severity: 'warn' });
    });

    // A consumer composes the path from the kit's name and never reads the one the manifest recorded, so a
    // bundle compiled elsewhere is listable and unloadable.
    it('reports a kit recorded away from the path a consumer loads it by', async () => {
      const entry = writeKit(projectRoot, 'default');
      writePackageJson(projectRoot, { files: ['.readyup'] });
      writeKitManifest(projectRoot, [{ ...entry, path: path.join('kits', 'nested', 'default.js') }]);

      const results = await runPackaging();

      expect(pickResult(results, 'under its own name')).toMatchObject({
        status: 'failed',
        detail: `The manifest records default at ${path.join('.readyup', 'kits', 'nested', 'default.js')}`,
      });
    });
  });

  describe('self-containment', () => {
    it('passes bundles importing only what the runner supplies', async () => {
      writePublishablePackage(projectRoot);

      const results = await runSelfContainment();

      expect(results.map((result) => result.status)).toStrictEqual(['passed']);
    });

    it('reports a bundle reaching for a package the consumer would have to supply', async () => {
      writePackageJson(projectRoot, { files: ['.readyup'] });
      writeKitManifest(projectRoot, [writeKit(projectRoot, 'default', { bundle: LEAKY_BUNDLE })]);

      const results = await runSelfContainment();

      expect(results[0]).toMatchObject({ status: 'failed', detail: 'It imports picomatch' });
    });

    it('stands down when the package compiles nothing', async () => {
      mkdirSync(path.join(projectRoot, FIXTURE_KITS_DIR), { recursive: true });

      const results = await runSelfContainment();

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ status: 'skipped', detail: 'There are no compiled kits' });
    });
  });

  // Publishing a stale kit ships checks that do not describe the package they travel with, which is the
  // failure this kit exists to stop -- so it blocks where `default` only advises.
  it('blocks on a kit compiled from a source that has since moved on', async () => {
    writePackageJson(projectRoot, { files: ['.readyup'] });
    const entry = writeKit(projectRoot, 'default');
    writeKitManifest(projectRoot, [{ ...entry, sourceHash: '0badcafe' }]);

    const results = await runChecklist(await loadOwnKit('publishing'), 'freshness');

    expect(pickResult(results, 'Its source')).toMatchObject({ status: 'failed', severity: 'error' });
  });
});

// region | Helpers

/** Runs the `packaging` checklist against the fixture as it now stands. */
async function runPackaging(): Promise<RdyResult[]> {
  return runChecklist(await loadOwnKit('publishing'), 'packaging');
}

/** Runs the `self-containment` checklist against the fixture as it now stands. */
async function runSelfContainment(): Promise<RdyResult[]> {
  return runChecklist(await loadOwnKit('publishing'), 'self-containment');
}

/** Lays down a package that would pass, so a test can spoil exactly the one thing it is about. */
function writePublishablePackage(
  projectRoot: string,
  packageJson?: Record<string, unknown>,
  kitName = 'default',
): void {
  writePackageJson(projectRoot, packageJson ?? { files: ['.readyup'] });
  writeKitManifest(projectRoot, [writeKit(projectRoot, kitName)]);
}

// endregion | Helpers
