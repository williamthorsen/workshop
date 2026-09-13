import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

import { UnresolvableKitImportsError } from '../../kitImports/UnresolvableKitImportsError.ts';
import { loadRemoteKit } from '../loadRemoteKit.ts';

/** Fetch options that bypass the cache and send no headers. */
const uncachedOptions = { cache: undefined, resolveHeaders: () => undefined };

/** Returns a minimal mock Response with the given body and status. */
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

    const { kit } = await loadRemoteKit({ url: 'https://example.com/config.js', ...uncachedOptions });

    expect(kit.checklists).toHaveLength(1);
    const [firstChecklist] = kit.checklists;
    expect(firstChecklist?.name).toBe('test');
  });

  it('throws when the module lacks a checklists export', async () => {
    const jsBody = 'export default {};';
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    await expect(loadRemoteKit({ url: 'https://example.com/config.js', ...uncachedOptions })).rejects.toThrow(
      'Kit file must export checklists',
    );
  });

  it('passes fixLocation through when exported', async () => {
    const jsBody = `
      export const fixLocation = 'inline';
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => true }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const { kit } = await loadRemoteKit({ url: 'https://example.com/config.js', ...uncachedOptions });

    expect(kit.fixLocation).toBe('inline');
  });

  it('omits fixLocation when not exported', async () => {
    const jsBody = `
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => true }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const { kit } = await loadRemoteKit({ url: 'https://example.com/config.js', ...uncachedOptions });

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

    const { compileTimeVersion } = await loadRemoteKit({ url: 'https://example.com/config.js', ...uncachedOptions });

    expect(compileTimeVersion).toBe('0.19.2');
  });

  it('returns undefined compileTimeVersion when __readyupVersion is absent', async () => {
    const jsBody = `
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => true }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const { compileTimeVersion } = await loadRemoteKit({ url: 'https://example.com/config.js', ...uncachedOptions });

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

    const { compileTimeVersion } = await loadRemoteKit({ url: 'https://example.com/config.js', ...uncachedOptions });

    expect(compileTimeVersion).toBeUndefined();
  });

  it('names the symbol that a remote kit binds and the runner does not export', async () => {
    const jsBody = `
      import { retiredHelper } from 'readyup/check-utils';
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => retiredHelper() }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const error = await captureError(UnresolvableKitImportsError, () =>
      loadRemoteKit({ url: 'https://example.com/config.js', ...uncachedOptions }),
    );

    expect(error.findings.missing).toStrictEqual([{ specifier: 'readyup/check-utils', names: ['retiredHelper'] }]);
  });

  it('accepts a remote kit binding only symbols exported by the runner', async () => {
    const jsBody = `
      import { fileExists } from 'readyup/check-utils';
      export const checklists = [
        { name: 'test', checks: [{ name: 'check-a', check: () => fileExists('package.json') }] },
      ];
    `;
    mockFetch.mockResolvedValue(mockResponse(jsBody));

    const { kit } = await loadRemoteKit({ url: 'https://example.com/config.js', ...uncachedOptions });

    expect(kit.checklists).toHaveLength(1);
  });

  it('evaluates a kit served from the cache without fetching it again', async () => {
    using tree = createTempTree({}, { prefix: 'readyup-remote-kit-cache-' });
    const options = { cache: { dir: tree.dir, reload: false }, resolveHeaders: () => undefined };
    const jsBody = `export const checklists = [{ name: 'test', checks: [{ name: 'check-a', check: () => true }] }];`;
    mockFetch.mockResolvedValueOnce(new Response(jsBody, { headers: { 'Cache-Control': 'max-age=300' } }));
    await loadRemoteKit({ url: 'https://example.com/config.js', ...options });

    const { kit } = await loadRemoteKit({ url: 'https://example.com/config.js', ...options });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(kit.checklists).toHaveLength(1);
  });

  it('rejects an HTML page served from the cache, as it rejects a fetched one', async () => {
    using tree = createTempTree({}, { prefix: 'readyup-remote-kit-cache-' });
    const options = { cache: { dir: tree.dir, reload: false }, resolveHeaders: () => undefined };
    const htmlBody = '<!DOCTYPE html><html><body>Error</body></html>';
    mockFetch.mockResolvedValueOnce(new Response(htmlBody, { headers: { 'Cache-Control': 'max-age=300' } }));
    await captureError(() => loadRemoteKit({ url: 'https://example.com/config.js', ...options }));

    await expect(loadRemoteKit({ url: 'https://example.com/config.js', ...options })).rejects.toThrow(
      'Remote kit URL returned an HTML page instead of JavaScript',
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
