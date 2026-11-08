import { beforeEach, describe, expect, it } from 'vitest';

import { kitLoadError } from '../../errors/RdyError.ts';
import type { KitProvenance } from '../../kits/KitProvenance.ts';
import type { JsonKitOrigin } from '../../schemas/reportSchema.ts';
import { runJsonMode } from '../runJsonMode.ts';
import { createRunFakes, type RunFakes } from '../test-utils/createRunFakes.ts';
import { buildSingleKitEntry, makeKit } from '../test-utils/kit-fixtures.ts';
import { runJson } from '../test-utils/runJson.ts';

describe(runJsonMode, () => {
  let fakes: RunFakes;

  beforeEach(() => {
    fakes = createRunFakes();
  });

  it('emits JSON output and no human-readable text', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { exitCode, stdout } = await runJson(buildSingleKitEntry(), {}, fakes);

    expect(fakes.formatJsonReport).toHaveBeenCalledTimes(1);
    expect(stdout).toBe('{"worstSeverity":null}\n');
    expect(exitCode).toBe(0);
  });

  it('returns exit code 1 when any checklist fails in JSON mode', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy
      .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
      .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

    const { exitCode } = await runJson(buildSingleKitEntry(), {}, fakes);

    expect(exitCode).toBe(1);
  });

  it('records an unloadable kit as an error entry, leaving stderr clean', async () => {
    fakes.loadKit.mockRejectedValue(kitLoadError('Kit not found'));
    fakes.formatJsonReport.mockReturnValue('{}');

    const { exitCode, stderr } = await runJson(buildSingleKitEntry(), {}, fakes);

    expect(exitCode).toBe(2);
    expect(fakes.formatJsonReport).toHaveBeenCalledWith(
      [{ name: 'default', error: { code: 'kit-load', message: 'Kit not found' } }],
      expect.anything(),
    );
    expect(stderr).toBe('');
  });

  it('records an unknown checklist name as an error entry, leaving stderr clean', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.formatJsonReport.mockReturnValue('{}');

    const { exitCode, stderr } = await runJson(buildSingleKitEntry(['nonexistent']), {}, fakes);

    expect(exitCode).toBe(2);
    expect(fakes.formatJsonReport).toHaveBeenCalledWith(
      [{ name: 'default', error: { code: 'usage', message: expect.stringContaining('nonexistent') } }],
      expect.anything(),
    );
    expect(stderr).toBe('');
  });

  it('passes kit-grouped entries to formatJsonReport', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    const report1 = { results: [], passed: true, durationMs: 10 };
    const report2 = { results: [], passed: true, durationMs: 20 };
    fakes.runRdy.mockResolvedValueOnce(report1).mockResolvedValueOnce(report2);

    await runJson(buildSingleKitEntry(), { detail: 'full' }, fakes);

    expect(fakes.formatJsonReport).toHaveBeenCalledWith(
      [
        {
          name: 'default',
          entries: [
            { name: 'deploy', report: report1 },
            { name: 'infra', report: report2 },
          ],
          failOn: 'error',
          reportOn: 'recommend',
        },
      ],
      // The run named no threshold, so the run-level options have none: `runJsonMode` passes the resolved
      // values to the serializer on the kit that they governed.
      { detail: 'full' },
    );
  });

  it.each([
    {
      label: 'a package kit by its source and version',
      provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0', source: 'npm:@acme/kits' },
      origin: { source: 'npm:@acme/kits', version: '2.1.0' },
    },
    {
      label: 'a repository kit by its source as written, without a version',
      provenance: {
        kind: 'repository',
        host: 'github',
        owner: 'acme',
        repo: '.github',
        ref: 'main',
        source: 'github:acme/.github',
      },
      origin: { source: 'github:acme/.github' },
    },
  ] satisfies Array<{ label: string; provenance: KitProvenance; origin: JsonKitOrigin }>)(
    'names the origin of $label',
    async ({ provenance, origin }) => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runJson(
        buildSingleKitEntry().map((entry) => ({ ...entry, provenance })),
        {},
        fakes,
      );

      expect(fakes.formatJsonReport).toHaveBeenCalledWith([expect.objectContaining({ origin })], expect.anything());
    },
  );

  it('sends a kit its own declared thresholds while the run level stays silent', async () => {
    const kit = makeKit({ failOn: 'warn', reportOn: 'error' });
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runJson(buildSingleKitEntry(), { detail: 'full' }, fakes);

    expect(fakes.formatJsonReport).toHaveBeenCalledWith(
      [expect.objectContaining({ failOn: 'warn', reportOn: 'error' })],
      { detail: 'full' },
    );
  });

  it('echoes a threshold requested by the invocation, which overrides what the kit declares', async () => {
    const kit = makeKit({ failOn: 'warn' });
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runJson(buildSingleKitEntry(), { failOn: 'recommend' }, fakes);

    expect(fakes.formatJsonReport).toHaveBeenCalledWith(
      [expect.objectContaining({ failOn: 'recommend' })],
      expect.objectContaining({ failOn: 'recommend' }),
    );
  });

  it('records an undiagnosed runner crash as an internal error entry', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockRejectedValue(new Error('runner crashed'));
    fakes.formatJsonReport.mockReturnValue('{}');

    const { exitCode } = await runJson(buildSingleKitEntry(['deploy']), {}, fakes);

    expect(exitCode).toBe(2);
    expect(fakes.formatJsonReport).toHaveBeenCalledWith(
      [{ name: 'default', error: { code: 'internal', message: 'runner crashed' } }],
      expect.anything(),
    );
  });

  it('discards the results of a kit that threw after its first checklist, and reports the next kit in full', async () => {
    fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
    const passing = { results: [], passed: true, durationMs: 0 };
    fakes.runRdy
      .mockResolvedValueOnce(passing)
      .mockRejectedValueOnce(new Error('runner crashed'))
      .mockResolvedValue(passing);

    const { exitCode } = await runJson(
      [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      {},
      fakes,
    );

    expect(exitCode).toBe(2);
    expect(fakes.formatJsonReport).toHaveBeenCalledWith(
      [
        { name: 'kit1', error: { code: 'internal', message: 'runner crashed' } },
        {
          name: 'kit2',
          entries: [
            { name: 'deploy', report: passing },
            { name: 'infra', report: passing },
          ],
          failOn: 'error',
          reportOn: 'recommend',
        },
      ],
      expect.anything(),
    );
  });

  it('does not write headers in JSON mode', async () => {
    const kit = makeKit();
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { stdout } = await runJson(buildSingleKitEntry(), {}, fakes);
    expect(stdout).not.toContain('---');
  });

  it('produces JSON output with multiple kit entries', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const { exitCode } = await runJson(
      [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      {},
      fakes,
    );

    expect(fakes.formatJsonReport).toHaveBeenCalledTimes(1);
    expect(fakes.formatJsonReport).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'kit1' }), expect.objectContaining({ name: 'kit2' })]),
      expect.anything(),
    );
    expect(exitCode).toBe(0);
  });

  describe('resolved thresholds', () => {
    it('passes reportOn to formatJsonReport', async () => {
      const kit = makeKit();
      fakes.loadKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runJson(buildSingleKitEntry(['deploy']), { reportOn: 'error' }, fakes);

      expect(fakes.formatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reportOn: 'error' }),
      );
    });
  });

  describe('raised hints', () => {
    const GITHUB_URL = 'https://raw.githubusercontent.com/acme/private/main/.readyup/kits/deploy.js';
    const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';

    it('passes the hint into the JSON report’s kit error entry', async () => {
      fakes.loadKit.mockRejectedValue(kitLoadError('boom', { hint: GITHUB_HINT }));
      fakes.formatJsonReport.mockReturnValue('{}');

      await runJson([{ name: 'deploy', source: { url: GITHUB_URL }, checklists: [] }], {}, fakes);

      expect(fakes.formatJsonReport).toHaveBeenCalledWith(
        [{ name: 'deploy', error: { code: 'kit-load', message: 'boom', hint: GITHUB_HINT } }],
        expect.anything(),
      );
    });
  });
});
