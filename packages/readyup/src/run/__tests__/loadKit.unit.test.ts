import assert from 'node:assert';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RdyKit } from '../../kits/types.ts';
import { RemoteFetchError } from '../../remote/RemoteFetchError.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockResolveBitbucketToken = vi.hoisted(() => vi.fn());

vi.mock(import('../../kits/loadRdyKit.ts'), () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock(import('../../remote/loadRemoteKit.ts'), () => ({
  loadRemoteKit: mockLoadRemoteKit,
}));

vi.mock(import('../../remote/resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.mock(import('../../remote/resolveBitbucketToken.ts'), () => ({
  resolveBitbucketToken: mockResolveBitbucketToken,
}));

import { UnresolvableKitImportsError } from '../../kitImports/UnresolvableKitImportsError.ts';
import { captureRdyError } from '../../test-utils/captureRdyError.ts';
import { VERSION } from '../../version.ts';
import { loadKit } from '../loadKit.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';

const BITBUCKET_URL = 'https://api.bitbucket.org/2.0/repositories/acme/private/src/main/.readyup/kits/deploy.js';
const GITHUB_URL = 'https://raw.githubusercontent.com/acme/private/main/.readyup/kits/deploy.js';
const THIRD_PARTY_URL = 'https://example.com/kits/deploy.js';

describe(loadKit, () => {
  afterEach(() => {
    mockLoadRdyKit.mockReset();
    mockLoadRemoteKit.mockReset();
    mockResolveGitHubToken.mockReset();
    mockResolveBitbucketToken.mockReset();
  });

  describe('local source', () => {
    it('answers with what the local loader produced', async () => {
      const loaded = { kit: makeKit(), compileTimeVersion: VERSION };
      mockLoadRdyKit.mockResolvedValue(loaded);

      await expect(loadKit(localEntry(), false)).resolves.toBe(loaded);
      expect(mockLoadRdyKit).toHaveBeenCalledWith('.readyup/kits/default.js');
    });

    it('advises installing readyup when a --jit kit cannot resolve it', async () => {
      mockLoadRdyKit.mockRejectedValue(moduleNotFoundError('readyup'));

      const error = await captureRdyError(() => loadKit(localEntry(), true));

      expect(error.code).toBe('kit-load');
      expect(error.message).toBe('Running from source requires readyup to be installed as a project dependency.');
    });

    it('passes through a module error naming another package under --jit', async () => {
      mockLoadRdyKit.mockRejectedValue(moduleNotFoundError('chalk'));

      const error = await captureRdyError(() => loadKit(localEntry(), true));

      expect(error.message).toBe("Cannot find package 'chalk'");
    });

    it('passes through an error carrying no module code under --jit', async () => {
      mockLoadRdyKit.mockRejectedValue(new Error('boom'));

      const error = await captureRdyError(() => loadKit(localEntry(), true));

      expect(error.message).toBe('boom');
    });

    it('leaves a missing readyup undiagnosed outside --jit, where the kit is a compiled bundle', async () => {
      mockLoadRdyKit.mockRejectedValue(moduleNotFoundError('readyup'));

      const error = await captureRdyError(() => loadKit(localEntry(), false));

      expect(error.message).toBe("Cannot find package 'readyup'");
    });

    it('forwards an install hint the underlying failure carries', async () => {
      mockLoadRdyKit.mockRejectedValue(
        Object.assign(new Error("Cannot resolve 'some-lib' while evaluating deploy.ts."), {
          hint: 'Install it with: pnpm add --save-dev some-lib',
        }),
      );

      const error = await captureRdyError(() => loadKit(localEntry(), false));

      expect(error.hint).toBe('Install it with: pnpm add --save-dev some-lib');
    });
  });

  describe('remote source', () => {
    it('forwards a GitHub token as a token-scheme Authorization header', async () => {
      mockResolveGitHubToken.mockReturnValue('token-abc');
      mockLoadRemoteKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });

      await loadKit(remoteEntry(GITHUB_URL), false);

      expect(mockResolveGitHubToken).toHaveBeenCalledWith();
      expect(mockLoadRemoteKit).toHaveBeenCalledWith({
        url: GITHUB_URL,
        headers: { Authorization: 'token token-abc' },
      });
    });

    it('forwards a Bitbucket token as a Bearer Authorization header', async () => {
      mockResolveBitbucketToken.mockReturnValue('bb-token-xyz');
      mockLoadRemoteKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });

      await loadKit(remoteEntry(BITBUCKET_URL), false);

      expect(mockResolveBitbucketToken).toHaveBeenCalledWith();
      expect(mockLoadRemoteKit).toHaveBeenCalledWith({
        url: BITBUCKET_URL,
        headers: { Authorization: 'Bearer bb-token-xyz' },
      });
    });

    it.each([
      ['GitHub', GITHUB_URL],
      ['Bitbucket', BITBUCKET_URL],
    ])('omits the header entirely when %s holds no token', async (_provider, url) => {
      mockResolveGitHubToken.mockReturnValue(undefined);
      mockResolveBitbucketToken.mockReturnValue(undefined);
      mockLoadRemoteKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });

      await loadKit(remoteEntry(url), false);

      expect(mockLoadRemoteKit).toHaveBeenCalledWith({ url });
      const [firstCall] = mockLoadRemoteKit.mock.calls;
      assert.ok(firstCall);
      expect(firstCall[0]).not.toHaveProperty('headers');
    });

    it('fetches a third-party URL without resolving any token', async () => {
      mockLoadRemoteKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });

      await loadKit(remoteEntry(THIRD_PARTY_URL), false);

      expect(mockResolveGitHubToken).not.toHaveBeenCalled();
      expect(mockResolveBitbucketToken).not.toHaveBeenCalled();
      expect(mockLoadRemoteKit).toHaveBeenCalledWith({ url: THIRD_PARTY_URL });
    });

    it('keeps the URL a fetch failure already names', async () => {
      mockLoadRemoteKit.mockRejectedValue(new Error(`Failed to fetch remote kit from ${BITBUCKET_URL}: 404 Not Found`));

      const error = await captureRdyError(() => loadKit(remoteEntry(BITBUCKET_URL), false));

      expect(error.message).toContain(BITBUCKET_URL);
    });

    it('names the URL a network failure does not carry', async () => {
      mockLoadRemoteKit.mockRejectedValue(new TypeError('fetch failed'));

      const error = await captureRdyError(() => loadKit(remoteEntry(BITBUCKET_URL), false));

      expect(error.message).toContain(BITBUCKET_URL);
    });

    it('prepends the URL to a kit-load message missing it', async () => {
      mockLoadRemoteKit.mockRejectedValue(new Error('Failed to fetch remote kit'));

      const error = await captureRdyError(() => loadKit(remoteEntry(THIRD_PARTY_URL), false));

      expect(error.message).toBe(`Failed to reach ${THIRD_PARTY_URL}: Failed to fetch remote kit`);
    });
  });

  describe('unresolvable readyup imports', () => {
    it('names every symbol the runner does not export', async () => {
      mockLoadRdyKit.mockRejectedValue(missingSymbolError());

      const error = await captureRdyError(() => loadKit(localEntry(), false));

      expect(error.code).toBe('kit-load');
      expect(error.message).toBe(
        `kit "default" cannot run against readyup ${VERSION}: readyup/check-utils does not export fileExists, runGit.`,
      );
    });

    it('advises recompiling a kit the project owns', async () => {
      mockLoadRdyKit.mockRejectedValue(missingSymbolError());

      const error = await captureRdyError(() => loadKit(localEntry(), false));

      expect(error.hint).toBe(`Run 'rdy compile' to rebuild it against readyup ${VERSION}.`);
    });

    it('names the publishing package and advises upgrading it', async () => {
      mockLoadRdyKit.mockRejectedValue(missingSymbolError());
      const entry: ResolvedKitEntry = {
        name: 'drift',
        source: { path: 'node_modules/@acme/kits/.readyup/kits/drift.js' },
        checklists: [],
        provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0' },
      };

      const error = await captureRdyError(() => loadKit(entry, false));

      expect(error.message).toContain('kit "drift" from @acme/kits cannot run against');
      expect(error.hint).toBe(`Upgrade @acme/kits to a release compiled against readyup ${VERSION}.`);
    });

    it('advises asking the publisher of a remote kit to recompile', async () => {
      mockLoadRemoteKit.mockRejectedValue(missingSymbolError());
      const entry: ResolvedKitEntry = {
        name: 'deploy',
        source: { url: THIRD_PARTY_URL },
        checklists: [],
        provenance: { kind: 'remote', label: 'example.com/kits/deploy.js' },
      };

      const error = await captureRdyError(() => loadKit(entry, false));

      expect(error.hint).toBe(
        `Ask the publisher of example.com/kits/deploy.js to recompile it against readyup ${VERSION}.`,
      );
    });
  });

  describe('credential hints', () => {
    const BITBUCKET_HINT = 'If the repository is private, set BITBUCKET_TOKEN.';
    const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';

    it.each([401, 403, 404])('hints at GITHUB_TOKEN on an unauthenticated %i from GitHub', async (status) => {
      mockResolveGitHubToken.mockReturnValue(undefined);

      await expect(hintFor(GITHUB_URL, status)).resolves.toBe(GITHUB_HINT);
    });

    it.each([401, 403, 404])('hints at BITBUCKET_TOKEN on an unauthenticated %i from Bitbucket', async (status) => {
      mockResolveBitbucketToken.mockReturnValue(undefined);

      await expect(hintFor(BITBUCKET_URL, status)).resolves.toBe(BITBUCKET_HINT);
    });

    it('stays silent when a token was forwarded', async () => {
      mockResolveGitHubToken.mockReturnValue('my-token');

      await expect(hintFor(GITHUB_URL, 404)).resolves.toBeUndefined();
    });

    it('stays silent for a third-party host, which readyup holds no credential for', async () => {
      await expect(hintFor(THIRD_PARTY_URL, 404)).resolves.toBeUndefined();
    });

    it.each([500, 502])('stays silent on a %i, which no credential would fix', async (status) => {
      mockResolveGitHubToken.mockReturnValue(undefined);

      await expect(hintFor(GITHUB_URL, status)).resolves.toBeUndefined();
    });

    it('stays silent on a network failure, which reached no host to be refused by', async () => {
      mockResolveGitHubToken.mockReturnValue(undefined);
      mockLoadRemoteKit.mockRejectedValue(new TypeError('fetch failed'));

      const error = await captureRdyError(() => loadKit(remoteEntry(GITHUB_URL), false));

      expect(error.hint).toBeUndefined();
    });

    /** Loads one kit from `url` against a fetch that failed with `status`, and answers with the hint raised. */
    async function hintFor(url: string, status: number): Promise<string | undefined> {
      mockLoadRemoteKit.mockRejectedValue(new RemoteFetchError(`Failed to fetch remote kit from ${url}`, status));
      const error = await captureRdyError(() => loadKit(remoteEntry(url), false));
      return error.hint;
    }
  });
});

// region | Helpers

/** Build an entry pointing at a compiled kit in the local kits directory. */
function localEntry(): ResolvedKitEntry {
  return { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] };
}

/** Build a minimal kit with one passing checklist. */
function makeKit(): RdyKit {
  return { checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] };
}

/** The failure a loader raises for a kit binding a symbol this runner does not export. */
function missingSymbolError(): UnresolvableKitImportsError {
  return new UnresolvableKitImportsError({
    unknownSubpaths: [],
    missing: [{ specifier: 'readyup/check-utils', names: ['fileExists', 'runGit'] }],
  });
}

/** The failure Node raises for an import that resolves to no installed package. */
function moduleNotFoundError(packageName: string): Error {
  return Object.assign(new Error(`Cannot find package '${packageName}'`), { code: 'MODULE_NOT_FOUND' });
}

/** Build an entry pointing at a kit served over HTTP. */
function remoteEntry(url: string): ResolvedKitEntry {
  return { name: 'deploy', source: { url }, checklists: [] };
}

// endregion | Helpers
