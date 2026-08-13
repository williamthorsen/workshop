import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RdyResult } from '../../../src/kits/types.ts';
import { pickResult, runChecklist } from '../test-utils/checklist-results.ts';
import { loadOwnKit } from '../test-utils/loadOwnKit.ts';
import type { FixtureManifestEntry, FixtureManifestInput } from '../test-utils/project-fixture.ts';
import {
  FIXTURE_KITS_DIR,
  writeInlineInput,
  writeKit,
  writeKitManifest,
  writeModuleInput,
  writePackageJson,
  writeRdyConfig,
} from '../test-utils/project-fixture.ts';

/** Module a fixture kit inlines, as the manifest records it: relative to the manifest's own directory. */
const INLINED_MODULE_PATH = path.join('kits', 'checks', 'helper.ts');

/** JSON file a fixture kit projects. It sits above the manifest directory, as the canonical `../package.json` does. */
const PROJECTED_JSON_PATH = path.join('..', 'package.json');

/**
 * Covers the `default` kit readyup publishes, against fixture projects in a temp directory.
 *
 * Every check the kit runs is relative to the working directory, so each test builds the project it
 * wants to be judged and moves there before loading the kit.
 */
describe('default kit', () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'kit-default-'));
    originalCwd = process.cwd();
    process.chdir(projectRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  });

  describe('setup', () => {
    it('passes a project holding a kit directory, a config, and a manifest', async () => {
      const entry = writeKit(projectRoot, 'default');
      writeKitManifest(projectRoot, [entry]);
      writeRdyConfig(projectRoot);

      const results = await runSetup();

      expect(results.map((result) => result.status)).toStrictEqual(['passed', 'passed']);
    });

    // A monorepo root that lists `packages` authors no kits of its own, and is not defective for it.
    it('stands down for a project that defines no kits', async () => {
      const results = await runSetup();

      expect(results).toHaveLength(2);
      expect(results.every((result) => result.status === 'skipped')).toBe(true);
      expect(results.every((result) => result.detail === 'This project defines no kits')).toBe(true);
    });

    // The manifest is where a project compiling to a non-default `outDir` declares that it has kits.
    it('applies to a project holding a manifest but no kit directory', async () => {
      writeKitManifest(projectRoot, []);

      const results = await runSetup();

      expect(pickResult(results, 'readyup.config.ts')).toMatchObject({ status: 'failed' });
    });

    // A project can be perfectly functional without one; the defaults it would have declared still apply.
    it('reports a missing config at the lowest severity', async () => {
      mkdirSync(path.join(projectRoot, FIXTURE_KITS_DIR), { recursive: true });

      const results = await runSetup();

      expect(pickResult(results, 'readyup.config.ts')).toMatchObject({ status: 'failed', severity: 'recommend' });
    });

    // Running kits straight from source with `--jit` compiles nothing, so there is nothing to record.
    it('does not ask for a manifest when nothing is compiled', async () => {
      mkdirSync(path.join(projectRoot, FIXTURE_KITS_DIR), { recursive: true });

      const results = await runSetup();

      expect(pickResult(results, 'manifest.json')).toMatchObject({
        status: 'skipped',
        detail: 'There are no compiled kits',
      });
    });

    it('asks for a manifest once a bundle exists', async () => {
      writeKit(projectRoot, 'default');

      const results = await runSetup();

      expect(pickResult(results, 'manifest.json')).toMatchObject({ status: 'failed' });
    });
  });

  describe('freshness', () => {
    it('passes when every recorded kit matches the hashes recorded for it', async () => {
      writeKitManifest(projectRoot, [writeKit(projectRoot, 'default'), writeKit(projectRoot, 'release')]);

      const results = await runFreshness();

      expect(results.every((result) => result.status === 'passed')).toBe(true);
      expect(results.filter((result) => result.depth === 0)).toHaveLength(2);
    });

    it('reports a source edited since it was compiled', async () => {
      const entry = writeKit(projectRoot, 'default');
      writeKitManifest(projectRoot, [{ ...entry, sourceHash: '0badcafe' }]);

      const results = await runFreshness();

      expect(pickResult(results, 'Its source')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('not the recorded 0badcafe'),
      });
      expect(pickResult(results, 'Its bundle')).toMatchObject({ status: 'passed' });
    });

    it('reports a bundle edited by hand', async () => {
      const entry = writeKit(projectRoot, 'default');
      writeKitManifest(projectRoot, [{ ...entry, targetHash: '0badcafe' }]);

      const results = await runFreshness();

      expect(pickResult(results, 'Its bundle')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('not the recorded 0badcafe'),
      });
    });

    it('reports a recorded file that is no longer there', async () => {
      const entry = writeKit(projectRoot, 'default');
      writeKitManifest(projectRoot, [entry]);
      rmSync(path.join(projectRoot, FIXTURE_KITS_DIR, 'default.js'));

      const results = await runFreshness();

      expect(pickResult(results, 'Its bundle')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('is missing'),
      });
    });

    // Without a recorded hash there is nothing to compare against, so the entry fails on its own terms
    // and the comparisons beneath it never claim a verdict they cannot support.
    it('reports an entry recording no hashes and withholds the comparisons', async () => {
      writeKit(projectRoot, 'default');
      writeKitManifest(projectRoot, [{ name: 'default' }]);

      const results = await runFreshness();

      expect(pickResult(results, 'recorded with a source and a bundle hash')).toMatchObject({
        status: 'failed',
        detail: 'The manifest records no source or bundle hash',
      });
      expect(pickResult(results, 'Its source')).toMatchObject({ status: 'skipped' });
      expect(pickResult(results, 'Its bundle')).toMatchObject({ status: 'skipped' });
    });

    it('reports a module it inlined that has since changed', async () => {
      writeKitManifest(projectRoot, [withInputs(writeKit(projectRoot, 'default'), inlineHelper(projectRoot, '1'))]);
      inlineHelper(projectRoot, '2');

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining(path.join('.readyup', INLINED_MODULE_PATH)),
      });
    });

    it('reports a projection it inlined that has since changed', async () => {
      writeKitManifest(projectRoot, [
        withInputs(writeKit(projectRoot, 'default'), projectVersion(projectRoot, '1.0.0')),
      ]);
      writePackageJson(projectRoot, { version: '2.0.0' });

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('package.json'),
      });
    });

    // The recorded hash is over the projection rather than the file, so a field the kit never picked up
    // is not something the bundle could have inlined.
    it('accepts an edit to a field the projection does not pick', async () => {
      writeKitManifest(projectRoot, [
        withInputs(writeKit(projectRoot, 'default'), projectVersion(projectRoot, '1.0.0')),
      ]);
      writePackageJson(projectRoot, { description: 'edited since the kit was compiled', version: '1.0.0' });

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({ status: 'passed' });
    });

    it('reports a projected file whose picked field is gone', async () => {
      writeKitManifest(projectRoot, [
        withInputs(writeKit(projectRoot, 'default'), projectVersion(projectRoot, '1.0.0')),
      ]);
      writePackageJson(projectRoot, {});

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('no longer projects'),
      });
    });

    it('reports an inlined module that is no longer there', async () => {
      writeKitManifest(projectRoot, [withInputs(writeKit(projectRoot, 'default'), inlineHelper(projectRoot, '1'))]);
      rmSync(path.join(projectRoot, '.readyup', INLINED_MODULE_PATH));

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('is missing'),
      });
    });

    // An entry compiled before readyup recorded the closure says nothing about whether the kit is stale.
    it('stands down for an entry recording no inputs', async () => {
      const { inputs, ...entry } = writeKit(projectRoot, 'default');
      writeKitManifest(projectRoot, [entry]);

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'skipped',
        detail: 'The manifest records no inputs for it',
      });
    });

    it('stands down when the project compiles nothing', async () => {
      mkdirSync(path.join(projectRoot, FIXTURE_KITS_DIR), { recursive: true });

      const results = await runFreshness();

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ status: 'skipped', detail: 'There are no compiled kits' });
    });

    it('reports bundles no manifest accounts for', async () => {
      writeKit(projectRoot, 'default');

      const results = await runFreshness();

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ status: 'failed' });
    });
  });

  // The kit is meant to be safe to run at any moment, including mid-edit, so nothing it finds blocks.
  it('raises nothing above advisory severity', async () => {
    writeKit(projectRoot, 'default');
    writeKitManifest(projectRoot, [{ name: 'default' }]);

    const results = [...(await runSetup()), ...(await runFreshness())];

    expect(results.every((result) => result.severity !== 'error')).toBe(true);
  });
});

// region | Helpers

/** Writes the module a fixture kit inlines, and returns the record of it. */
function inlineHelper(projectRoot: string, value: string): FixtureManifestInput {
  return writeModuleInput(projectRoot, INLINED_MODULE_PATH, `export const helper = ${value};\n`);
}

/** Writes the JSON file a fixture kit projects, and returns the record of the projection over `version`. */
function projectVersion(projectRoot: string, version: string): FixtureManifestInput {
  return writeInlineInput(projectRoot, PROJECTED_JSON_PATH, { name: 'fixture', version }, ['version']);
}

/** Runs the `freshness` checklist against the fixture as it now stands. */
async function runFreshness(): Promise<RdyResult[]> {
  return runChecklist(await loadOwnKit('default'), 'freshness');
}

/** Runs the `setup` checklist against the fixture as it now stands. */
async function runSetup(): Promise<RdyResult[]> {
  return runChecklist(await loadOwnKit('default'), 'setup');
}

/** Adds recorded inputs to a fixture entry, beside the entry module `writeKit` already records. */
function withInputs(entry: FixtureManifestEntry, ...inputs: FixtureManifestInput[]): FixtureManifestEntry {
  return { ...entry, inputs: [...entry.inputs, ...inputs] };
}

// endregion | Helpers
