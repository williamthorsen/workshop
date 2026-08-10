import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { RdyKit } from '../types.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn());
const mockFormatJsonReport = vi.hoisted(() => vi.fn());

vi.mock(import('../config.ts'), () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock(import('../runRdy.ts'), () => ({
  meetsThreshold: () => true,
  runRdy: mockRunRdy,
}));

vi.mock(import('../reportRdy.ts'), async () => {
  const actual = await vi.importActual<typeof import('../reportRdy.ts')>('../reportRdy.ts');
  return { ...actual, reportRdy: mockReportRdy };
});

vi.mock(import('../formatCombinedSummary.ts'), () => ({
  formatCombinedSummary: mockFormatCombinedSummary,
}));

vi.mock(import('../formatJsonReport.ts'), () => ({
  formatJsonReport: mockFormatJsonReport,
}));

vi.mock(import('../remote/loadRemoteKit.ts'), () => ({
  loadRemoteKit: mockLoadRemoteKit,
}));

import { runCommand } from '../cli.ts';
import { UnresolvableKitImportsError } from '../kitImports/UnresolvableKitImportsError.ts';
import { VERSION } from '../version.ts';

/** The failure a loader raises for a kit binding a symbol this runner does not export. */
function missingSymbolError(): UnresolvableKitImportsError {
  return new UnresolvableKitImportsError({
    unknownSubpaths: [],
    missing: [{ specifier: 'readyup/check-utils', names: ['fileExists', 'runGit'] }],
  });
}

/** Build a minimal kit with one passing checklist. */
function makeKit(): RdyKit {
  return { checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] };
}

describe('kit-import failure', () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: true });
    mockFormatCombinedSummary.mockReturnValue('');
    mockFormatJsonReport.mockReturnValue('{}');
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadRdyKit.mockReset();
    mockLoadRemoteKit.mockReset();
    mockRunRdy.mockReset();
    mockReportRdy.mockReset();
    mockFormatCombinedSummary.mockReset();
    mockFormatJsonReport.mockReset();
  });

  /** Concatenate every stderr write into a single string for substring assertions. */
  function stderrText(): string {
    return stderrSpy.mock.calls.map((call) => String(call[0])).join('');
  }

  /** Concatenate every stdout write into a single string for substring assertions. */
  function stdoutText(): string {
    return stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
  }

  it('names every missing symbol and fails the invocation', async () => {
    mockLoadRdyKit.mockRejectedValue(missingSymbolError());

    const exitCode = await runCommand({
      kitEntries: [{ name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] }],
      json: false,
    });

    expect(exitCode).toBe(2);
    expect(stderrText()).toContain(
      `kit "default" cannot run against readyup ${VERSION}: readyup/check-utils does not export fileExists, runGit.`,
    );
    expect(mockRunRdy).not.toHaveBeenCalled();
  });

  it('advises recompiling a kit the project owns', async () => {
    mockLoadRdyKit.mockRejectedValue(missingSymbolError());

    await runCommand({
      kitEntries: [{ name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] }],
      json: false,
    });

    expect(stderrText()).toContain(`Run 'rdy compile' to rebuild it against readyup ${VERSION}.`);
  });

  it('names the publishing package and advises upgrading it', async () => {
    mockLoadRdyKit.mockRejectedValue(missingSymbolError());

    await runCommand({
      kitEntries: [
        {
          name: 'drift',
          source: { path: 'node_modules/@acme/kits/.readyup/kits/drift.js' },
          checklists: [],
          provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0' },
        },
      ],
      json: false,
    });

    const stderr = stderrText();
    expect(stderr).toContain('kit "drift" from @acme/kits cannot run against');
    expect(stderr).toContain(`Upgrade @acme/kits to a release compiled against readyup ${VERSION}.`);
  });

  it('advises asking the publisher of a remote kit to recompile', async () => {
    mockLoadRemoteKit.mockRejectedValue(missingSymbolError());
    const url = 'https://example.com/kits/deploy.js';

    await runCommand({
      kitEntries: [
        {
          name: 'deploy',
          source: { url },
          checklists: [],
          provenance: { kind: 'remote', label: 'example.com/kits/deploy.js' },
        },
      ],
      json: false,
    });

    expect(stderrText()).toContain(
      `Ask the publisher of example.com/kits/deploy.js to recompile it against readyup ${VERSION}.`,
    );
  });

  it('keeps running the kits that are not at fault', async () => {
    mockLoadRdyKit
      .mockRejectedValueOnce(missingSymbolError())
      .mockResolvedValueOnce({ kit: makeKit(), compileTimeVersion: VERSION });

    const exitCode = await runCommand({
      kitEntries: [
        { name: 'broken', source: { path: '.readyup/kits/broken.js' }, checklists: [] },
        { name: 'healthy', source: { path: '.readyup/kits/healthy.js' }, checklists: [] },
      ],
      json: false,
    });

    expect(exitCode).toBe(2);
    expect(mockRunRdy).toHaveBeenCalledTimes(1);
  });

  it('reports the failure as a kit-load error in JSON mode', async () => {
    mockLoadRdyKit.mockRejectedValue(missingSymbolError());
    mockFormatJsonReport.mockReturnValue('{"kits":[]}');

    await runCommand({
      kitEntries: [{ name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] }],
      json: true,
    });

    const [kitInputs] = mockFormatJsonReport.mock.calls[0] ?? [];
    expect(kitInputs).toStrictEqual([
      {
        name: 'default',
        error: {
          code: 'kit-load',
          message: expect.stringContaining('readyup/check-utils does not export fileExists, runGit'),
          hint: expect.stringContaining("Run 'rdy compile'"),
        },
      },
    ]);
    expect(stdoutText()).toBe('{"kits":[]}\n');
  });
});
