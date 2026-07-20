import { afterEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

import { loadRemoteKit } from '../src/loadRemoteKit.ts';

/** Build a minimal mock Response with the given body and status. */
function mockResponse(
  body: string,
  init?: { status?: number; statusText?: string },
): Pick<Response, 'ok' | 'status' | 'statusText' | 'text' | 'headers'> {
  return {
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    text: () => Promise.resolve(body),
    headers: new Headers(),
  };
}

describe('loadRemoteKit validation', () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('resolves a module with a valid checklists export', async () => {
    const jsBody = `
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => true }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const { kit } = await loadRemoteKit({ url: 'https://example.com/config.js' });

    expect(kit.checklists).toHaveLength(1);
    const [firstChecklist] = kit.checklists;
    expect(firstChecklist?.name).toBe('test');
  });

  it('throws when the module lacks a checklists export', async () => {
    const jsBody = 'export default {};';
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    await expect(loadRemoteKit({ url: 'https://example.com/config.js' })).rejects.toThrow(
      'Kit file must export checklists',
    );
  });

  it('carries through fixLocation when exported', async () => {
    const jsBody = `
      export const fixLocation = 'inline';
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => true }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const { kit } = await loadRemoteKit({ url: 'https://example.com/config.js' });

    expect(kit.fixLocation).toBe('inline');
  });

  it('omits fixLocation when not exported', async () => {
    const jsBody = `
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => true }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const { kit } = await loadRemoteKit({ url: 'https://example.com/config.js' });

    expect(kit.fixLocation).toBeUndefined();
  });

  it('returns compileTimeVersion when __readyupVersion is exported as a string', async () => {
    const jsBody = `
      export const __readyupVersion = '0.19.2';
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => true }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const { compileTimeVersion } = await loadRemoteKit({ url: 'https://example.com/config.js' });

    expect(compileTimeVersion).toBe('0.19.2');
  });

  it('returns undefined compileTimeVersion when __readyupVersion is absent', async () => {
    const jsBody = `
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => true }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const { compileTimeVersion } = await loadRemoteKit({ url: 'https://example.com/config.js' });

    expect(compileTimeVersion).toBeUndefined();
  });

  it('returns undefined compileTimeVersion when __readyupVersion is not a string', async () => {
    const jsBody = `
      export const __readyupVersion = 42;
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => true }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const { compileTimeVersion } = await loadRemoteKit({ url: 'https://example.com/config.js' });

    expect(compileTimeVersion).toBeUndefined();
  });
});
