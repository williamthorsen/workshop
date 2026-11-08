import { beforeEach, describe, expect, it } from 'vitest';

import type { RaisedWarning } from '../../schemas/common.ts';
import type { ManifestTracking } from '../kit-staleness.ts';
import { runJsonMode } from '../runJsonMode.ts';
import { createRunFakes, type RunFakes } from '../test-utils/createRunFakes.ts';
import { buildSingleKitEntry, makeKit } from '../test-utils/kit-fixtures.ts';
import { runJson } from '../test-utils/runJson.ts';

/** A warning as the unmarked-generated report returns it. */
const GENERATED_UNMARKED: RaisedWarning = {
  code: 'generated-unmarked',
  message:
    'dist/app.mjs looks like bundler output (its mean line length exceeds 250 characters) and is not marked as generated.',
  remedy: 'Add `/dist/app.mjs linguist-generated=true` to .gitattributes, so that kits stop sweeping it.',
};

describe(runJsonMode, () => {
  let fakes: RunFakes;

  beforeEach(() => {
    fakes = createRunFakes();
  });

  describe('staleness advisories', () => {
    const SOURCE_STALE: RaisedWarning = {
      code: 'source-stale',
      message: 'kit "beta" was compiled from an older source than the one on disk.',
      remedy: 'Run `rdy compile` to rebuild it.',
    };

    const TARGET_DRIFT: RaisedWarning = {
      code: 'target-drift',
      message: 'compiled kit "alpha" does not match the hash that the manifest recorded for it.',
      remedy: 'Move the edits into the source, then run `rdy compile --force`.',
    };

    /** Builds two entries whose names and compiled paths differ, so that a kit paired with the wrong source shows. */
    function buildTwoKitEntries() {
      return [
        { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: ['deploy'] },
        { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: ['deploy'] },
      ];
    }

    it('passes every advisory raised by the run into the JSON report', async () => {
      const tracking: ManifestTracking = { manifest: { version: 1, kits: [] }, manifestDir: '.readyup' };
      fakes.readManifestTracking.mockReturnValue({ tracking, warnings: [] });
      fakes.listKitStalenessWarnings.mockReturnValueOnce([TARGET_DRIFT]).mockReturnValueOnce([SOURCE_STALE]);
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      fakes.formatJsonReport.mockReturnValue('{"kits":[]}');

      const { exitCode } = await runJson(buildTwoKitEntries(), {}, fakes);

      expect(fakes.listKitStalenessWarnings).toHaveBeenNthCalledWith(
        1,
        'alpha',
        { path: '.readyup/kits/alpha.js' },
        tracking,
      );
      expect(fakes.listKitStalenessWarnings).toHaveBeenNthCalledWith(
        2,
        'beta',
        { path: '.readyup/kits/beta.js' },
        tracking,
      );
      expect(fakes.formatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ warnings: [TARGET_DRIFT, SOURCE_STALE] }),
      );
      expect(exitCode).toBe(0);
    });

    it('passes an advisory raised by the manifest read itself into the report', async () => {
      const manifestUnreadable: RaisedWarning = {
        code: 'manifest-unreadable',
        message: '.readyup/manifest.json could not be read, so no kit was checked against it: bad JSON',
        remedy: 'Run `rdy compile` to rewrite it.',
      };
      fakes.readManifestTracking.mockReturnValue({ tracking: undefined, warnings: [manifestUnreadable] });
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      fakes.formatJsonReport.mockReturnValue('{"kits":[]}');

      const { exitCode } = await runJson(buildSingleKitEntry(['deploy']), {}, fakes);

      expect(fakes.formatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ warnings: [manifestUnreadable] }),
      );
      expect(exitCode).toBe(0);
    });

    it('puts a diagnosed masked pass into the report and onto stderr', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({
        results: [],
        passed: true,
        durationMs: 0,
        diagnoses: [{ name: 'a', verdict: 'masked-pass' }],
      });
      fakes.formatJsonReport.mockReturnValue('{"kits":[]}');

      const { stderr } = await runJson(buildSingleKitEntry(['deploy']), { diagnose: true }, fakes);

      expect(fakes.formatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          warnings: [expect.objectContaining({ code: 'skip-masks-pass' })],
        }),
      );
      expect(stderr).toContain('skipped check "a" in kit "default" / checklist "deploy" would have passed.');
    });

    it('omits the warnings field entirely when the run raised none', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      fakes.formatJsonReport.mockReturnValue('{}');

      await runJson(buildSingleKitEntry(['deploy']), {}, fakes);

      expect(fakes.formatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ warnings: expect.anything() }),
      );
    });
  });

  describe('unrun-source advisories', () => {
    it('reports each configured source that contributed no kit in the warnings field', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      fakes.formatJsonReport.mockReturnValue('{}');
      const unrunSources = [
        { spelling: 'github:acme/standards', requestedNames: ['default'], publishedNames: ['demo', 'drift'] },
      ];

      const { stderr } = await runJson(buildSingleKitEntry(), { unrunSources }, fakes);

      expect(fakes.formatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          warnings: [
            {
              code: 'source-not-run',
              message:
                'configured source "github:acme/standards" publishes no kit named "default", so the run ran none of its kits.',
              remedy:
                'Run its kits by name with `rdy run --sources demo`, or every kit with `rdy run --sources --all`. Its other kits: drift.',
            },
          ],
        }),
      );
      expect(stderr).toContain('Warning: configured source "github:acme/standards"');
    });
  });

  describe('unused-pragma advisories', () => {
    const PRAGMA_UNUSED: RaisedWarning = {
      code: 'pragma-unused',
      message: '`rdy-ignore` pragma at src/a.ts:3 suppressed no finding in this run.',
      remedy: 'Remove the pragma, or run the kit whose check it was written for.',
    };

    it('passes the entries into the report’s warnings', async () => {
      fakes.listUnusedPragmaWarnings.mockReturnValue([PRAGMA_UNUSED]);
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { exitCode } = await runJson(buildSingleKitEntry(['deploy']), {}, fakes);

      expect(fakes.formatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ warnings: [PRAGMA_UNUSED] }),
      );
      expect(exitCode).toBe(0);
    });
  });

  describe('unmarked-generated advisories', () => {
    it('passes the entries into the report’s warnings, leaving the exit code alone', async () => {
      fakes.listUnmarkedGeneratedSourceWarnings.mockResolvedValue([GENERATED_UNMARKED]);
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const { exitCode } = await runJson(buildSingleKitEntry(['deploy']), {}, fakes);

      expect(fakes.formatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ warnings: [GENERATED_UNMARKED] }),
      );
      expect(exitCode).toBe(0);
    });
  });

  describe('warning output', () => {
    it('writes every warning to stderr in the order of the report’s warnings', async () => {
      fakes.readManifestTracking.mockReturnValue({
        tracking: undefined,
        warnings: [{ code: 'manifest-unreadable', message: 'manifest unreadable.', remedy: 'Rewrite it.' }],
      });
      fakes.listKitStalenessWarnings.mockReturnValue([
        { code: 'target-drift', message: 'kit drifted.', remedy: 'Move the edits.' },
      ]);
      fakes.listUnusedPragmaWarnings.mockReturnValue([
        { code: 'pragma-unused', message: 'pragma unused.', remedy: 'Remove it.' },
      ]);
      fakes.listUnmarkedGeneratedSourceWarnings.mockResolvedValue([GENERATED_UNMARKED]);
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: '999.0.0' });
      fakes.runRdy.mockResolvedValue({
        results: [],
        passed: true,
        durationMs: 0,
        diagnoses: [{ name: 'a', verdict: 'masked-pass' }],
      });
      fakes.formatJsonReport.mockReturnValue('{"kits":[]}');

      const { stderr } = await runJson(
        buildSingleKitEntry(['deploy']),
        {
          unrunSources: [{ spelling: 'npm:a', requestedNames: ['default'], publishedNames: ['x'] }],
        },
        fakes,
      );

      const warnings = fakes.formatJsonReport.mock.lastCall?.[1].warnings ?? [];
      expect(warnings.map(({ code }) => code)).toStrictEqual([
        'manifest-unreadable',
        'target-drift',
        'version-skew',
        'skip-masks-pass',
        'pragma-unused',
        'generated-unmarked',
        'source-not-run',
      ]);
      expect(stderr).toBe(warnings.map(({ message, remedy }) => `Warning: ${message} ${remedy}\n`).join(''));
    });
  });
});
