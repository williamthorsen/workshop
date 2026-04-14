import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compareLocalRefsModule from '../../../src/check-utils/git/compare-local-refs.ts';
import * as compareRefToRemoteModule from '../../../src/check-utils/git/compare-ref-to-remote.ts';
import { makeLocalRefSyncCheck, makeRemoteRefSyncCheck } from '../../../src/check-utils/git/factories.ts';
import type { LocalRefsCompareResult, RemoteRefCompareResult } from '../../../src/types.ts';

vi.mock('../../../src/check-utils/git/compare-local-refs.ts', () => ({
  compareLocalRefs: vi.fn(),
}));

vi.mock('../../../src/check-utils/git/compare-ref-to-remote.ts', () => ({
  compareRefToRemote: vi.fn(),
}));

const mockCompareLocalRefs = vi.mocked(compareLocalRefsModule.compareLocalRefs);
const mockCompareRefToRemote = vi.mocked(compareRefToRemoteModule.compareRefToRemote);

beforeEach(() => {
  vi.clearAllMocks();
});

describe(makeLocalRefSyncCheck, () => {
  it('passes when refs match', async () => {
    const result: LocalRefsCompareResult = { status: 'match', shaA: 'aaa', shaB: 'aaa' };
    mockCompareLocalRefs.mockResolvedValue(result);

    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/repo', refA: 'main', refB: 'feature' });

    expect(await check.check()).toBe(true);
  });

  it('reports ahead detail when refA is ahead', async () => {
    const result: LocalRefsCompareResult = {
      status: 'mismatch',
      shaA: 'aaa',
      shaB: 'bbb',
      aheadBehind: { ahead: 3, behind: 0 },
    };
    mockCompareLocalRefs.mockResolvedValue(result);

    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/repo', refA: 'main', refB: 'feature' });
    const outcome = await check.check();

    expect(outcome).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('ahead') }));
  });

  it('reports behind detail when refA is behind', async () => {
    const result: LocalRefsCompareResult = {
      status: 'mismatch',
      shaA: 'aaa',
      shaB: 'bbb',
      aheadBehind: { ahead: 0, behind: 2 },
    };
    mockCompareLocalRefs.mockResolvedValue(result);

    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/repo', refA: 'main', refB: 'feature' });
    const outcome = await check.check();

    expect(outcome).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('behind') }));
    expect(outcome).toEqual(expect.objectContaining({ detail: expect.stringContaining('git merge') }));
  });

  it('reports diverged detail when both sides have commits', async () => {
    const result: LocalRefsCompareResult = {
      status: 'mismatch',
      shaA: 'aaa',
      shaB: 'bbb',
      aheadBehind: { ahead: 2, behind: 3 },
    };
    mockCompareLocalRefs.mockResolvedValue(result);

    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/repo', refA: 'main', refB: 'feature' });
    const outcome = await check.check();

    expect(outcome).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('diverged') }));
  });

  it('reports diverged detail when aheadBehind is unavailable', async () => {
    const result: LocalRefsCompareResult = { status: 'mismatch', shaA: 'aaa', shaB: 'bbb' };
    mockCompareLocalRefs.mockResolvedValue(result);

    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/repo', refA: 'main', refB: 'feature' });
    const outcome = await check.check();

    expect(outcome).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('diverged') }));
  });

  it('reports ref-missing detail for a nonexistent ref', async () => {
    const result: LocalRefsCompareResult = { status: 'ref-missing', ref: 'nonexistent' };
    mockCompareLocalRefs.mockResolvedValue(result);

    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/repo', refA: 'nonexistent', refB: 'HEAD' });
    const outcome = await check.check();

    expect(outcome).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('nonexistent') }));
  });

  it('uses custom fix when provided', () => {
    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/repo', refA: 'a', refB: 'b', fix: 'custom fix' });

    expect(check.fix).toBe('custom fix');
  });

  it('has no fix when not provided', () => {
    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/repo', refA: 'a', refB: 'b' });

    expect(check.fix).toBeUndefined();
  });

  it('forwards severity to the check', () => {
    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/repo', refA: 'a', refB: 'b', severity: 'warn' });

    expect(check.severity).toBe('warn');
  });

  it('omits severity when not provided', () => {
    const check = makeLocalRefSyncCheck({ name: 'sync', path: '/repo', refA: 'a', refB: 'b' });

    expect(check.severity).toBeUndefined();
  });
});

describe(makeRemoteRefSyncCheck, () => {
  it('passes when in-sync', async () => {
    const result: RemoteRefCompareResult = { status: 'in-sync', localSha: 'aaa', remoteSha: 'aaa' };
    mockCompareRefToRemote.mockResolvedValue(result);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: '/repo', ref: 'main' });
    const skipResult = await check.skip?.();
    expect(skipResult).toBe(false);

    expect(await check.check()).toBe(true);
  });

  it('reports ahead detail when local is ahead', async () => {
    const result: RemoteRefCompareResult = {
      status: 'out-of-sync',
      localSha: 'aaa',
      remoteSha: 'bbb',
      aheadBehind: { ahead: 1, behind: 0 },
    };
    mockCompareRefToRemote.mockResolvedValue(result);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: '/repo', ref: 'main' });
    const outcome = await check.check();

    expect(outcome).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('ahead') }));
  });

  it('reports behind detail when local is behind', async () => {
    const result: RemoteRefCompareResult = {
      status: 'out-of-sync',
      localSha: 'aaa',
      remoteSha: 'bbb',
      aheadBehind: { ahead: 0, behind: 3 },
    };
    mockCompareRefToRemote.mockResolvedValue(result);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: '/repo', ref: 'main' });
    const outcome = await check.check();

    expect(outcome).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('behind') }));
    expect(outcome).toEqual(expect.objectContaining({ detail: expect.stringContaining('git pull') }));
  });

  it('reports diverged detail when both sides have commits', async () => {
    const result: RemoteRefCompareResult = {
      status: 'out-of-sync',
      localSha: 'aaa',
      remoteSha: 'bbb',
      aheadBehind: { ahead: 2, behind: 5 },
    };
    mockCompareRefToRemote.mockResolvedValue(result);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: '/repo', ref: 'main' });
    const outcome = await check.check();

    expect(outcome).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('diverged') }));
  });

  it('reports ref-missing detail when remote ref does not exist', async () => {
    const result: RemoteRefCompareResult = { status: 'ref-missing', ref: 'origin/feature' };
    mockCompareRefToRemote.mockResolvedValue(result);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: '/repo', ref: 'feature' });
    const outcome = await check.check();

    expect(outcome).toEqual(expect.objectContaining({ ok: false, detail: expect.stringContaining('origin/feature') }));
  });

  it('returns skip reason when remote is unreachable', async () => {
    const result: RemoteRefCompareResult = { status: 'unreachable', error: new Error('network') };
    mockCompareRefToRemote.mockResolvedValue(result);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: '/repo', ref: 'main' });
    const skipResult = await check.skip?.();

    expect(typeof skipResult).toBe('string');
    expect(skipResult).toContain('unreachable');
  });

  it('returns pass from check() when remote is unreachable', async () => {
    const result: RemoteRefCompareResult = { status: 'unreachable', error: new Error('network') };
    mockCompareRefToRemote.mockResolvedValue(result);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: '/repo', ref: 'main' });

    expect(await check.check()).toBe(true);
  });

  it('invokes the probe at most once when both skip and check are called', async () => {
    const result: RemoteRefCompareResult = { status: 'in-sync', localSha: 'aaa', remoteSha: 'aaa' };
    mockCompareRefToRemote.mockResolvedValue(result);

    const check = makeRemoteRefSyncCheck({ name: 'remote-sync', path: '/repo', ref: 'main' });
    await check.skip?.();
    await check.check();

    expect(mockCompareRefToRemote).toHaveBeenCalledTimes(1);
  });

  it('uses custom fix when provided', () => {
    const check = makeRemoteRefSyncCheck({ name: 'sync', path: '/repo', ref: 'main', fix: 'run git pull' });

    expect(check.fix).toBe('run git pull');
  });

  it('has no fix when not provided', () => {
    const check = makeRemoteRefSyncCheck({ name: 'sync', path: '/repo', ref: 'main' });

    expect(check.fix).toBeUndefined();
  });

  it('forwards severity to the check', () => {
    const check = makeRemoteRefSyncCheck({ name: 'sync', path: '/repo', ref: 'main', severity: 'recommend' });

    expect(check.severity).toBe('recommend');
  });

  it('omits severity when not provided', () => {
    const check = makeRemoteRefSyncCheck({ name: 'sync', path: '/repo', ref: 'main' });

    expect(check.severity).toBeUndefined();
  });
});
