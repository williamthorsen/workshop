import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockScaffoldConfig = vi.hoisted(() => vi.fn());

vi.mock('../src/init/scaffold.ts', () => ({
  scaffoldConfig: mockScaffoldConfig,
}));

const mockReportWriteResult = vi.hoisted(() => vi.fn());

vi.mock('../src/terminal.ts', () => ({
  printError: vi.fn(),
  printSkip: vi.fn(),
  printStep: vi.fn(),
  printSuccess: vi.fn(),
  reportWriteResult: mockReportWriteResult,
}));

import { initCommand } from '../src/init/initCommand.ts';

/** Build a scaffold result with both files having the same outcome. */
function makeScaffoldResult(outcome: string) {
  return {
    configResult: { filePath: '.config/readyup.config.ts', outcome },
    kitResult: { filePath: '.readyup/kits/default.ts', outcome },
  };
}

describe(`${initCommand.name} error handling`, () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockScaffoldConfig.mockReset();
    mockReportWriteResult.mockReset();
  });

  it('throws an internal error when scaffoldConfig throws', () => {
    mockScaffoldConfig.mockImplementation(() => {
      throw new Error('disk full');
    });

    expect(() => initCommand({ dryRun: false, force: false })).toThrow(
      expect.objectContaining({ code: 'internal', message: expect.stringContaining('disk full') }),
    );
  });

  it('throws an internal error naming the file when the config result failed', () => {
    mockScaffoldConfig.mockReturnValue(makeScaffoldResult('failed'));

    expect(() => initCommand({ dryRun: false, force: false })).toThrow(
      expect.objectContaining({ code: 'internal', message: 'Failed to scaffold .config/readyup.config.ts' }),
    );
  });

  it('throws an internal error naming the file when the kit result failed', () => {
    mockScaffoldConfig.mockReturnValue({
      configResult: { filePath: '.config/readyup.config.ts', outcome: 'created' },
      kitResult: { filePath: '.readyup/kits/default.ts', outcome: 'failed' },
    });

    expect(() => initCommand({ dryRun: false, force: false })).toThrow(
      expect.objectContaining({ code: 'internal', message: 'Failed to scaffold .readyup/kits/default.ts' }),
    );
  });

  it('returns exit code 0 when both results are created', () => {
    mockScaffoldConfig.mockReturnValue(makeScaffoldResult('created'));

    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
  });

  it.each([
    { outcome: 'created', dryRun: false },
    { outcome: 'overwritten', dryRun: false },
    { outcome: 'overwritten', dryRun: true },
    { outcome: 'up-to-date', dryRun: false },
    { outcome: 'skipped', dryRun: false },
    { outcome: 'failed', dryRun: false },
  ])('calls reportWriteResult for both files with $outcome outcome (dryRun=$dryRun)', ({ outcome, dryRun }) => {
    const result = makeScaffoldResult(outcome);
    mockScaffoldConfig.mockReturnValue(result);

    // A failed write is reported per-file before the command throws, so both calls land either way.
    try {
      initCommand({ dryRun, force: false });
    } catch {
      // The thrown failure is asserted by its own test.
    }

    expect(mockReportWriteResult).toHaveBeenCalledWith(result.configResult, dryRun);
    expect(mockReportWriteResult).toHaveBeenCalledWith(result.kitResult, dryRun);
  });
});
