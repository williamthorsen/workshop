import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockEnumerateKits = vi.hoisted(() => vi.fn());

vi.mock('../src/loadConfig.ts', () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock('../src/list/enumerateKits.ts', () => ({
  enumerateKits: mockEnumerateKits,
}));

import { listCommand } from '../src/list/listCommand.ts';

describe(listCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: undefined },
      internal: { dir: '.', extension: '.ts' },
    });
    mockEnumerateKits.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadConfig.mockReset();
    mockEnumerateKits.mockReset();
  });

  describe('owner mode', () => {
    it('loads config and enumerates both internal and compiled kits', async () => {
      mockEnumerateKits.mockReturnValueOnce(['default']).mockReturnValueOnce(['deploy']);

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).toHaveBeenCalled();
      expect(mockEnumerateKits).toHaveBeenCalledTimes(2);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Internal:');
      expect(output).toContain('Compiled:');
    });

    it('renders only Internal section when no compiled kits exist', async () => {
      mockEnumerateKits.mockReturnValueOnce(['default']).mockReturnValueOnce([]);

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Internal:');
      expect(output).not.toContain('Compiled:');
    });

    it('uses custom-outDir style when outDir differs from default', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: 'src/kits', outDir: 'dist/kits', include: undefined },
        internal: { dir: '.', extension: '.ts' },
      });
      mockEnumerateKits.mockReturnValueOnce([]).mockReturnValueOnce(['deploy']);

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('dist/kits/deploy.js');
      expect(output).toContain('--file');
    });

    it('prints empty-owner message when no kits exist', async () => {
      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('No kits found.');
    });

    it('returns 1 and writes to stderr when config load fails', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config'));

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('bad config'));
    });
  });

  describe('consumer mode', () => {
    it('does not load config when --local is given', async () => {
      mockEnumerateKits.mockReturnValue([]);

      const exitCode = await listCommand(['--local', '.']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).not.toHaveBeenCalled();
    });

    it('enumerates compiled kits from the local path', async () => {
      mockEnumerateKits.mockReturnValue(['deploy']);

      const exitCode = await listCommand(['--local', '.']);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Compiled:');
      expect(output).toContain('deploy');
    });

    it('prints empty-consumer message when no kits exist at the local path', async () => {
      mockEnumerateKits.mockReturnValue([]);

      const exitCode = await listCommand(['--local', '/nonexistent']);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('No compiled kits found at /nonexistent/.rdy/kits/.');
    });

    it('accepts -l as short form of --local', async () => {
      mockEnumerateKits.mockReturnValue(['default']);

      const exitCode = await listCommand(['-l', '.']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).not.toHaveBeenCalled();
    });
  });

  it('returns 1 for unknown flags', async () => {
    const exitCode = await listCommand(['--unknown']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown option: --unknown'));
  });
});
