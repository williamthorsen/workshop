import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

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

const mockBuildInstallCommand = vi.hoisted(() => vi.fn());
const mockIsPackageResolvable = vi.hoisted(() => vi.fn());

vi.mock('../src/utils/install-command.ts', () => ({
  buildInstallCommand: mockBuildInstallCommand,
}));

vi.mock('../src/utils/resolve-package.ts', () => ({
  isPackageResolvable: mockIsPackageResolvable,
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
    mockBuildInstallCommand.mockReset();
    mockIsPackageResolvable.mockReset();
  });

  it('throws a config error when scaffoldConfig throws', () => {
    mockScaffoldConfig.mockImplementation(() => {
      throw new Error('disk full');
    });

    expect(() => initCommand({ dryRun: false, force: false })).toThrow(
      expect.objectContaining({ code: 'config', message: expect.stringContaining('disk full') }),
    );
  });

  it('throws a config error naming the file when the config result failed', () => {
    mockScaffoldConfig.mockReturnValue(makeScaffoldResult('failed'));

    expect(() => initCommand({ dryRun: false, force: false })).toThrow(
      expect.objectContaining({ code: 'config', message: 'Failed to scaffold .config/readyup.config.ts' }),
    );
  });

  it('throws a config error naming the file when the kit result failed', () => {
    mockScaffoldConfig.mockReturnValue({
      configResult: { filePath: '.config/readyup.config.ts', outcome: 'created' },
      kitResult: { filePath: '.readyup/kits/default.ts', outcome: 'failed' },
    });

    expect(() => initCommand({ dryRun: false, force: false })).toThrow(
      expect.objectContaining({ code: 'config', message: 'Failed to scaffold .readyup/kits/default.ts' }),
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

describe(`${initCommand.name} next steps`, () => {
  let infoSpy: MockInstance;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mockScaffoldConfig.mockReturnValue(makeScaffoldResult('created'));
    mockBuildInstallCommand.mockReturnValue('pnpm add --save-dev readyup');
    mockIsPackageResolvable.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockScaffoldConfig.mockReset();
    mockBuildInstallCommand.mockReset();
    mockIsPackageResolvable.mockReset();
  });

  it('names only rdy commands, never npx readyup', () => {
    initCommand({ dryRun: false, force: false });

    expect(printedSteps(infoSpy)).not.toContain('npx readyup');
    expect(printedSteps(infoSpy)).toContain('rdy compile');
    expect(printedSteps(infoSpy)).toContain('rdy run');
  });

  it('omits the install step when readyup already resolves', () => {
    initCommand({ dryRun: false, force: false });

    const steps = printedSteps(infoSpy);
    expect(steps).not.toContain('Install readyup');
    expect(steps).toContain('1. Customize .config/readyup.config.ts');
    expect(steps).toContain('5. Commit the generated files.');
  });

  it('leads with the install step when readyup does not resolve', () => {
    mockIsPackageResolvable.mockReturnValue(false);

    initCommand({ dryRun: false, force: false });

    const steps = printedSteps(infoSpy);
    expect(steps).toContain('1. Install readyup as a dev dependency: pnpm add --save-dev readyup');
    expect(steps).toContain('2. Customize .config/readyup.config.ts');
    expect(steps).toContain('6. Commit the generated files.');
  });

  it('prints no next steps in dry-run mode', () => {
    initCommand({ dryRun: true, force: false });

    expect(printedSteps(infoSpy)).not.toContain('Customize');
  });
});

/** Join everything written to `console.info` into one string. */
function printedSteps(infoSpy: MockInstance): string {
  return infoSpy.mock.calls.map((call) => String(call[0])).join('\n');
}
