import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { computeHash } from '../../../src/check-utils/hashing.ts';
import type { RdyResult } from '../../../src/kits/types.ts';
import { pickResult, runChecklist } from '../test-utils/checklist-results.ts';
import { loadOwnKit } from '../test-utils/loadOwnKit.ts';
import {
  FIXTURE_INLINED_MODULE_PATH,
  FIXTURE_KITS_DIR,
  type FixtureManifestInput,
  SELF_CONTAINED_BUNDLE,
  withInputs,
  writeInlineInput,
  writeInstalledKitPackage,
  writeKit,
  writeKitManifest,
  writeModuleInput,
  writePackageJson,
  writeRawKitManifest,
  writeRdyConfig,
} from '../test-utils/project-fixture.ts';

/**
 * JSON file projected by a fixture kit. It is above the manifest directory, as the canonical
 * `../package.json` is.
 */
const PROJECTED_JSON_PATH = path.join('..', 'package.json');

/** Substring of the name of the check that compares installed kit-publishing dependencies against `sources`. */
const SOURCES_CHECK = 'is listed in "sources"';

const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'kit-default-' })),
);

/**
 * Covers the `default` kit that readyup publishes, against fixture projects in a temp directory.
 *
 * The kit runs every check relative to the working directory, so each test builds the project that it
 * wants to be judged and moves there before loading the kit.
 */
describe('default kit', () => {
  describe('setup', () => {
    it('passes a project containing a kit directory, a config, and a manifest', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const entry = writeKit(temp.dir, 'default');
      writeKitManifest(temp.dir, [entry]);
      writeRdyConfig(temp.dir);

      const results = await runSetup();

      expect(results.map((result) => result.status)).toStrictEqual(['passed', 'passed', 'skipped']);
    });

    // A monorepo root that lists `sources` authors no kits of its own, and is not defective for it.
    it('skips every authoring check for a project that defines no kits', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const results = await runSetup();

      const authoringResults = [pickResult(results, 'readyup.config.ts'), pickResult(results, 'manifest.json')];
      expect(authoringResults.every((result) => result.status === 'skipped')).toBe(true);
      expect(authoringResults.every((result) => result.detail === 'This project defines no kits')).toBe(true);
    });

    it('reports an installed kit-publishing dependency that "sources" does not list', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeConsumerProject({ sources: ['npm:listed-kit'] });

      const results = await runSetup();

      expect(pickResult(results, SOURCES_CHECK)).toMatchObject({
        status: 'failed',
        detail: 'npm:unlisted-kit is not listed in "sources"',
      });
    });

    it('passes once every kit-publishing dependency is listed', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeConsumerProject({ sources: ['npm:listed-kit', 'npm:unlisted-kit'] });

      const results = await runSetup();

      expect(pickResult(results, SOURCES_CHECK)).toMatchObject({ status: 'passed' });
    });

    it('passes when "omittedSources" names the unlisted dependency', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeConsumerProject({ sources: ['npm:listed-kit'], omittedSources: ['npm:unlisted-kit'] });

      const results = await runSetup();

      expect(pickResult(results, SOURCES_CHECK)).toMatchObject({ status: 'passed' });
    });

    it('does not report a dependency that publishes no kits', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeConsumerProject({ sources: ['npm:listed-kit', 'npm:unlisted-kit'] });
      writeInstalledKitPackage(temp.dir, 'kitless', []);
      writePackageJson(temp.dir, { devDependencies: { kitless: '1.0.0', 'listed-kit': '1.0.0' } });

      const results = await runSetup();

      expect(pickResult(results, SOURCES_CHECK)).toMatchObject({ status: 'passed' });
    });

    it('skips the source check when the config lists no sources', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeConsumerProject({ sources: [] });

      const results = await runSetup();

      expect(pickResult(results, SOURCES_CHECK)).toMatchObject({
        status: 'skipped',
        detail: 'The readyup config lists no sources',
      });
    });

    it('skips the source check when the project has no config', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeInstalledKitPackage(temp.dir, 'unlisted-kit', ['default']);
      writePackageJson(temp.dir, { devDependencies: { 'unlisted-kit': '1.0.0' } });

      const results = await runSetup();

      expect(pickResult(results, SOURCES_CHECK)).toMatchObject({ status: 'skipped' });
    });

    // A project compiling to a non-default `outDir` declares in the manifest that it has kits.
    it('applies to a project containing a manifest but no kit directory', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, []);

      const results = await runSetup();

      expect(pickResult(results, 'readyup.config.ts')).toMatchObject({ status: 'failed' });
    });

    // A project can be perfectly functional without one; the defaults that it would have declared still apply.
    it('reports a missing config at the lowest severity', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      mkdirSync(path.join(temp.dir, FIXTURE_KITS_DIR), { recursive: true });

      const results = await runSetup();

      expect(pickResult(results, 'readyup.config.ts')).toMatchObject({ status: 'failed', severity: 'recommend' });
    });

    // Running kits straight from source with `--jit` compiles nothing, so there is nothing to record.
    it('does not ask for a manifest when nothing is compiled', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      mkdirSync(path.join(temp.dir, FIXTURE_KITS_DIR), { recursive: true });

      const results = await runSetup();

      expect(pickResult(results, 'manifest.json')).toMatchObject({
        status: 'skipped',
        detail: 'There are no compiled kits',
      });
    });

    it('asks for a manifest once a bundle exists', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKit(temp.dir, 'default');

      const results = await runSetup();

      expect(pickResult(results, 'manifest.json')).toMatchObject({ status: 'failed' });
    });
  });

  describe('freshness', () => {
    it('passes when every recorded kit matches the hashes recorded for it', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [writeKit(temp.dir, 'default'), writeKit(temp.dir, 'release')]);

      const results = await runFreshness();

      expect(results.every((result) => result.status === 'passed')).toBe(true);
      expect(results.filter((result) => result.depth <= 1).map((result) => [result.depth, result.name])).toStrictEqual([
        [0, '.readyup/manifest.json records kits'],
        [1, 'default is recorded with a source and a bundle hash'],
        [1, 'release is recorded with a source and a bundle hash'],
        [0, 'Every compiled kit is recorded in the manifest'],
      ]);
    });

    it('reports a source edited since it was compiled', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const entry = writeKit(temp.dir, 'default');
      writeKitManifest(temp.dir, [{ ...entry, sourceHash: '0badcafe' }]);

      const results = await runFreshness();

      expect(pickResult(results, 'Its source')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('not the recorded 0badcafe'),
      });
      expect(pickResult(results, 'Its bundle')).toMatchObject({ status: 'passed' });
    });

    it('reports a bundle edited by hand', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const entry = writeKit(temp.dir, 'default');
      writeKitManifest(temp.dir, [{ ...entry, targetHash: '0badcafe' }]);

      const results = await runFreshness();

      expect(pickResult(results, 'Its bundle')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('not the recorded 0badcafe'),
      });
    });

    it.for([12, 64])('passes on a bundle recorded with a %i-character hash', async (length, { temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const entry = writeKit(temp.dir, 'default');
      writeKitManifest(temp.dir, [{ ...entry, targetHash: computeHash(SELF_CONTAINED_BUNDLE).slice(0, length) }]);

      const results = await runFreshness();

      expect(pickResult(results, 'Its bundle')).toMatchObject({ status: 'passed' });
    });

    it.for(['0badcaf', '0badcafg'])(
      'reports %o as a recorded value that is not a hash',
      async (targetHash, { temp }) => {
        using _cwd = pointCwdAt(temp.dir, { chdir: true });

        const entry = writeKit(temp.dir, 'default');
        writeKitManifest(temp.dir, [{ ...entry, targetHash }]);

        const results = await runFreshness();

        expect(pickResult(results, 'Its bundle')).toMatchObject({
          status: 'failed',
          detail: expect.stringContaining(`records ${targetHash}, which is not a hash`),
        });
      },
    );

    it('reports a recorded file that is no longer there', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const entry = writeKit(temp.dir, 'default');
      writeKitManifest(temp.dir, [entry]);
      rmSync(path.join(temp.dir, FIXTURE_KITS_DIR, 'default.js'));

      const results = await runFreshness();

      expect(pickResult(results, 'Its bundle')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('is missing'),
      });
    });

    // Without a recorded hash there is nothing to compare against, so the check fails the entry itself
    // and skips the comparisons beneath it, which cannot support a verdict.
    it('reports an entry recording no hashes and withholds the comparisons', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKit(temp.dir, 'default');
      writeKitManifest(temp.dir, [{ name: 'default' }]);

      const results = await runFreshness();

      expect(pickResult(results, 'recorded with a source and a bundle hash')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('records no source or bundle hash'),
      });
      expect(pickResult(results, 'Its source')).toMatchObject({ status: 'skipped' });
      expect(pickResult(results, 'Its bundle')).toMatchObject({ status: 'skipped' });
    });

    it('reports an inlined module that has since changed', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [withInputs(writeKit(temp.dir, 'default'), inlineHelper(temp.dir, '1'))]);
      inlineHelper(temp.dir, '2');

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining(path.join('.readyup', FIXTURE_INLINED_MODULE_PATH)),
      });
    });

    it('leaves an edited source to the source check alone', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [withInputs(writeKit(temp.dir, 'default'), inlineHelper(temp.dir, '1'))]);
      writeFileSync(path.join(temp.dir, FIXTURE_KITS_DIR, 'default.ts'), 'export default { edited: true };\n');

      const results = await runFreshness();

      expect(pickResult(results, 'Its source')).toMatchObject({ status: 'failed' });
      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'passed',
        progress: { type: 'fraction', passedCount: 1, count: 1 },
      });
    });

    it('counts only the inputs past the source when one has changed', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [withInputs(writeKit(temp.dir, 'default'), inlineHelper(temp.dir, '1'))]);
      writeFileSync(path.join(temp.dir, FIXTURE_KITS_DIR, 'default.ts'), 'export default { edited: true };\n');
      inlineHelper(temp.dir, '2');

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.not.stringContaining('default.ts'),
        progress: { type: 'fraction', passedCount: 0, count: 1 },
      });
    });

    it('passes a kit that inlines nothing past its source', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [writeKit(temp.dir, 'default')]);
      writeFileSync(path.join(temp.dir, FIXTURE_KITS_DIR, 'default.ts'), 'export default { edited: true };\n');

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'passed',
        detail: 'It inlines nothing past its source',
      });
    });

    it('leaves a deleted source to the source check when the recorded source passes through a symlink', async ({
      temp,
    }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const realKitsDir = path.join(temp.dir, '.readyup', 'real');
      mkdirSync(realKitsDir, { recursive: true });
      symlinkSync(realKitsDir, path.join(temp.dir, FIXTURE_KITS_DIR));
      const entry = writeKit(temp.dir, 'default');
      // A compile records each input at the path to which esbuild resolved it.
      writeKitManifest(temp.dir, [
        { ...entry, inputs: [{ hash: entry.sourceHash, kind: 'module', path: path.join('real', 'default.ts') }] },
      ]);
      rmSync(path.join(realKitsDir, 'default.ts'));

      const results = await runFreshness();

      expect(pickResult(results, 'Its source')).toMatchObject({ status: 'failed' });
      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'passed',
        detail: 'It inlines nothing past its source',
      });
    });

    it('reports an inlined projection that has since changed', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [withInputs(writeKit(temp.dir, 'default'), projectVersion(temp.dir, '1.0.0'))]);
      writePackageJson(temp.dir, { version: '2.0.0' });

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('package.json'),
      });
    });

    // The recorded hash is over the projection rather than the file, so a field never picked up by the
    // kit is not something the bundle could have inlined.
    it('accepts an edit to a field that the projection does not pick', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [withInputs(writeKit(temp.dir, 'default'), projectVersion(temp.dir, '1.0.0'))]);
      writePackageJson(temp.dir, { description: 'edited since the kit was compiled', version: '1.0.0' });

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({ status: 'passed' });
    });

    it('reports a projected file whose picked field is gone', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [withInputs(writeKit(temp.dir, 'default'), projectVersion(temp.dir, '1.0.0'))]);
      writePackageJson(temp.dir, {});

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('no longer projects'),
      });
    });

    it('reports an inlined module that is no longer there', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [withInputs(writeKit(temp.dir, 'default'), inlineHelper(temp.dir, '1'))]);
      rmSync(path.join(temp.dir, '.readyup', FIXTURE_INLINED_MODULE_PATH));

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('is missing'),
      });
    });

    // An entry compiled before readyup recorded the closure says nothing about whether the kit is stale.
    it('skips the comparison for an entry recording no inputs', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const { inputs, ...entry } = writeKit(temp.dir, 'default');
      writeKitManifest(temp.dir, [entry]);

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'skipped',
        detail: 'The manifest records no inputs for it',
      });
    });

    it('reports an inlined JSON file that is no longer there', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [withInputs(writeKit(temp.dir, 'default'), projectVersion(temp.dir, '1.0.0'))]);
      rmSync(path.join(temp.dir, 'package.json'));

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('package.json is missing'),
      });
    });

    // The kit reads raw JSON rather than the manifest schema, so these two guards, rather than
    // validation, reject a record that no compile would have written.
    it('reports an inline record whose path specifier is not one', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const entry = writeKit(temp.dir, 'default');
      const input = { hash: '0badcafe', kind: 'inline', path: PROJECTED_JSON_PATH, paths: [42] };
      writeRawKitManifest(temp.dir, [{ ...entry, inputs: [input] }]);

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('records no paths'),
      });
    });

    it('names only the fields missing from an incomplete input record', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const entry = writeKit(temp.dir, 'default');
      const input = { path: path.join('kits', 'demo.ts'), hash: '0badcafe' };
      writeRawKitManifest(temp.dir, [{ ...entry, inputs: [input] }]);

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('.readyup/kits/demo.ts records no kind'),
      });
    });

    // A record with no path has nothing to lead with, so the message names the input instead.
    it('names every absent field of an input record that has no path to lead with', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      const entry = writeKit(temp.dir, 'default');
      writeRawKitManifest(temp.dir, [{ ...entry, inputs: [{ kind: 'module' }] }]);

      const results = await runFreshness();

      expect(pickResult(results, 'Everything it inlined')).toMatchObject({
        status: 'failed',
        detail: expect.stringContaining('records an input with no path or hash'),
      });
    });

    it('skips when the project compiles nothing', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      mkdirSync(path.join(temp.dir, FIXTURE_KITS_DIR), { recursive: true });

      const results = await runFreshness();

      expect(results.map(({ detail, status }) => ({ detail, status }))).toStrictEqual([
        { status: 'skipped', detail: 'The manifest records no kits' },
        { status: 'skipped', detail: 'There are no compiled kits' },
      ]);
    });

    it('reports bundles that no manifest accounts for', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKit(temp.dir, 'default');

      const results = await runFreshness();

      expect(results).toHaveLength(2);
      expect(pickResult(results, 'records kits')).toMatchObject({ status: 'skipped' });
      expect(pickResult(results, 'Every compiled kit is recorded')).toMatchObject({
        status: 'failed',
        detail: '.readyup/manifest.json records no entry for .readyup/kits/default.js',
      });
    });

    // A compile removes a deleted kit's entry, and a bundle left behind stays loadable by name.
    it('names each bundle that the manifest does not record, beside the kits that it does', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.dir, { chdir: true });

      writeKitManifest(temp.dir, [writeKit(temp.dir, 'default')]);
      writeKit(temp.dir, 'legacy');
      writeKit(temp.dir, 'retired');

      const results = await runFreshness();

      expect(pickResult(results, 'Every compiled kit is recorded')).toMatchObject({
        status: 'failed',
        detail: '.readyup/manifest.json records no entry for .readyup/kits/legacy.js, .readyup/kits/retired.js',
      });
      expect(pickResult(results, 'default is recorded')).toMatchObject({ status: 'passed' });
    });
  });

  // The kit is meant to be safe to run at any moment, including mid-edit, so nothing it finds has blocking severity.
  it('raises nothing above advisory severity', async ({ temp }) => {
    using _cwd = pointCwdAt(temp.dir, { chdir: true });

    writeKit(temp.dir, 'default');
    writeKitManifest(temp.dir, [{ name: 'default' }]);

    const results = [...(await runSetup()), ...(await runFreshness())];

    expect(results.every((result) => result.severity !== 'error')).toBe(true);
  });
});

// region | Helpers

/** Writes the module inlined by a fixture kit, and returns the record of it. */
function inlineHelper(projectRoot: string, value: string): FixtureManifestInput {
  return writeModuleInput(projectRoot, FIXTURE_INLINED_MODULE_PATH, `export const helper = ${value};\n`);
}

/** Writes the JSON file projected by a fixture kit, and returns the record of the projection over `version`. */
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

/**
 * Writes a project that defines no kits and depends on two kit-publishing packages, `listed-kit` and `unlisted-kit`,
 * under the given config.
 */
function writeConsumerProject(config: Record<string, unknown>): void {
  writeInstalledKitPackage(process.cwd(), 'listed-kit', ['default']);
  writeInstalledKitPackage(process.cwd(), 'unlisted-kit', ['default']);
  writePackageJson(process.cwd(), { devDependencies: { 'listed-kit': '1.0.0', 'unlisted-kit': '1.0.0' } });
  writeRdyConfig(process.cwd(), config);
}

// endregion | Helpers
