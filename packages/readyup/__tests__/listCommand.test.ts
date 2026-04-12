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
      internal: { dir: '.', infix: undefined },
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
      expect(mockEnumerateKits).toHaveBeenCalledWith(
        expect.objectContaining({ dir: expect.stringContaining('.rdy/kits'), extension: '.ts' }),
      );
      expect(mockEnumerateKits).toHaveBeenCalledWith(
        expect.objectContaining({ dir: expect.stringContaining('.rdy/kits'), extension: '.js' }),
      );
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Internal:');
      expect(output).toContain('Compiled:');
    });

    it('uses infix-based extension for internal kits when configured', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.rdy/kits', outDir: '.rdy/kits', include: undefined },
        internal: { dir: '.', infix: 'int' },
      });
      mockEnumerateKits.mockReturnValueOnce(['default']).mockReturnValueOnce([]);

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(0);
      expect(mockEnumerateKits).toHaveBeenCalledWith(expect.objectContaining({ extension: '.int.ts' }));
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
        internal: { dir: '.', infix: undefined },
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

    it('returns 1 and writes to stderr when enumerateKits throws', async () => {
      const permError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      mockEnumerateKits.mockImplementation(() => {
        throw permError;
      });

      const exitCode = await listCommand([]);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
    });
  });

  describe('from mode', () => {
    it('does not load config when --from is given', async () => {
      mockEnumerateKits.mockReturnValue([]);

      const exitCode = await listCommand(['--from', '.']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).not.toHaveBeenCalled();
    });

    it('enumerates compiled kits from a local path', async () => {
      mockEnumerateKits.mockReturnValue(['deploy']);

      const exitCode = await listCommand(['--from', '.']);

      expect(exitCode).toBe(0);
      expect(mockEnumerateKits).toHaveBeenCalledWith(
        expect.objectContaining({ dir: expect.stringContaining('.rdy/kits'), extension: '.js' }),
      );
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Compiled:');
      expect(output).toContain('deploy');
    });

    it('prints empty-consumer message when no kits exist at the local path', async () => {
      mockEnumerateKits.mockReturnValue([]);

      const exitCode = await listCommand(['--from', '/nonexistent']);

      expect(exitCode).toBe(0);
      const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('No compiled kits found at /nonexistent/.rdy/kits.');
    });

    it('returns 1 and writes to stderr when enumerateKits throws', async () => {
      const permError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      mockEnumerateKits.mockImplementation(() => {
        throw permError;
      });

      const exitCode = await listCommand(['--from', '.']);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
    });

    it('returns 1 for github: scheme with not-yet-supported message', async () => {
      const exitCode = await listCommand(['--from', 'github:org/repo']);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('not yet supported'));
    });

    it('returns 1 for bitbucket: scheme with not-yet-supported message', async () => {
      const exitCode = await listCommand(['--from', 'bitbucket:team/repo']);

      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('not yet supported'));
    });
  });

  it('returns 1 for unknown flags', async () => {
    const exitCode = await listCommand(['--unknown']);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown option: --unknown'));
  });
});
