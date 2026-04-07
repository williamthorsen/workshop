import { afterEach, describe, expect, it, vi } from 'vitest';

const mockExecFileSync = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

import { resolveGitHubToken } from '../src/resolveGitHubToken.ts';

describe(resolveGitHubToken, () => {
  const originalEnv = process.env.GITHUB_TOKEN;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalEnv;
    }
    mockExecFileSync.mockReset();
  });

  it('returns GITHUB_TOKEN env var when set', () => {
    process.env.GITHUB_TOKEN = 'env-token-123';

    expect(resolveGitHubToken()).toBe('env-token-123');
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('falls back to gh auth token output', () => {
    delete process.env.GITHUB_TOKEN;
    mockExecFileSync.mockReturnValue('  gh-token-456\n');

    expect(resolveGitHubToken()).toBe('gh-token-456');
  });

  it('returns undefined when both sources fail', () => {
    delete process.env.GITHUB_TOKEN;
    mockExecFileSync.mockImplementation(() => {
      throw new Error('gh not found');
    });

    expect(resolveGitHubToken()).toBeUndefined();
  });

  it('returns undefined when gh returns empty output', () => {
    delete process.env.GITHUB_TOKEN;
    mockExecFileSync.mockReturnValue('  \n');

    expect(resolveGitHubToken()).toBeUndefined();
  });

  it('skips empty GITHUB_TOKEN env var', () => {
    process.env.GITHUB_TOKEN = '';
    mockExecFileSync.mockReturnValue('gh-token-789\n');

    expect(resolveGitHubToken()).toBe('gh-token-789');
  });
});
