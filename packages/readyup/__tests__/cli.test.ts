import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { RdyKit } from '../src/types.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn());
const mockFormatJsonReport = vi.hoisted(() => vi.fn());
const mockFormatJsonError = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockResolveBitbucketToken = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());

vi.mock('../src/config.ts', () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock('../src/runRdy.ts', () => ({
  meetsThreshold: (severity: string, threshold: string) => {
    const rank: Record<string, number> = { error: 0, warn: 1, recommend: 2 };
    const severityRank = rank[severity];
    const thresholdRank = rank[threshold];
    if (severityRank === undefined || thresholdRank === undefined) {
      throw new Error(`Invalid severity in meetsThreshold mock: severity="${severity}", threshold="${threshold}"`);
    }
    return severityRank <= thresholdRank;
  },
  runRdy: mockRunRdy,
}));

vi.mock('../src/reportRdy.ts', async () => {
  const actual = await vi.importActual<typeof import('../src/reportRdy.ts')>('../src/reportRdy.ts');
  return {
    ...actual,
    reportRdy: mockReportRdy,
  };
});

vi.mock('../src/formatCombinedSummary.ts', () => ({
  formatCombinedSummary: mockFormatCombinedSummary,
}));

vi.mock('../src/formatJsonReport.ts', () => ({
  formatJsonReport: mockFormatJsonReport,
}));

vi.mock('../src/formatJsonError.ts', () => ({
  formatJsonError: mockFormatJsonError,
}));

vi.mock('../src/resolveGitHubToken.ts', () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.mock('../src/resolveBitbucketToken.ts', () => ({
  resolveBitbucketToken: mockResolveBitbucketToken,
}));

vi.mock('../src/loadRemoteKit.ts', () => ({
  loadRemoteKit: mockLoadRemoteKit,
}));

import { parseRunArgs, resolveKitSources, runCommand } from '../src/cli.ts';

function makeKit(overrides?: Partial<RdyKit>): RdyKit {
  return {
    checklists: [
      { name: 'deploy', checks: [{ name: 'a', check: () => true }] },
      { name: 'infra', checks: [{ name: 'b', check: () => true }] },
    ],
    ...overrides,
  };
}

describe(parseRunArgs, () => {
  it('returns undefined checklists and empty specifiers when no flags are given', () => {
    const result = parseRunArgs([]);

    expect(result.checklists).toBeUndefined();
    expect(result.kitSpecifiers).toStrictEqual([]);
    expect(result.filePath).toBeUndefined();
    expect(result.fromValue).toBeUndefined();
    expect(result.urlValue).toBeUndefined();
    expect(result.json).toBe(false);
    expect(result.jit).toBe(false);
    expect(result.internal).toBe(false);
  });

  it('parses positional kit specifiers', () => {
    const result = parseRunArgs(['deploy', 'infra']);

    expect(result.kitSpecifiers).toStrictEqual([
      { kitName: 'deploy', checklists: [] },
      { kitName: 'infra', checklists: [] },
    ]);
  });

  it('parses positional kit specifiers with colon syntax', () => {
    const result = parseRunArgs(['deploy:check1,check2']);

    expect(result.kitSpecifiers).toStrictEqual([{ kitName: 'deploy', checklists: ['check1', 'check2'] }]);
  });

  // --checklists flag
  it('parses --checklists with --file', () => {
    const result = parseRunArgs(['--checklists', 'check1,check2', '--file', 'path.ts']);

    expect(result.checklists).toStrictEqual(['check1', 'check2']);
    expect(result.filePath).toBe('path.ts');
  });

  it('parses --checklists with --url', () => {
    const result = parseRunArgs(['--checklists', 'check1', '--url', 'https://example.com/kit.js']);

    expect(result.checklists).toStrictEqual(['check1']);
  });

  it('throws when --checklists is used without --file or --url', () => {
    expect(() => parseRunArgs(['--checklists', 'check1'])).toThrow(
      '--checklists can only be used with --file or --url',
    );
  });

  it('throws when --checklists is used with --from', () => {
    expect(() => parseRunArgs(['--checklists', 'check1', '--from', 'github:org/repo'])).toThrow(
      '--checklists can only be used with --file or --url',
    );
  });

  it('throws when --file is combined with positional args', () => {
    expect(() => parseRunArgs(['--file', 'path.ts', 'deploy'])).toThrow(
      '--file cannot be combined with positional kit arguments',
    );
  });

  it('throws when --url is combined with positional args', () => {
    expect(() => parseRunArgs(['--url', 'https://example.com/kit.js', 'deploy'])).toThrow(
      '--url cannot be combined with positional kit arguments',
    );
  });

  // --file flag
  it('parses --file flag', () => {
    const result = parseRunArgs(['--file', 'custom/path.ts']);

    expect(result.filePath).toBe('custom/path.ts');
    expect(result.kitSpecifiers).toStrictEqual([]);
  });

  it('parses --file= syntax', () => {
    const result = parseRunArgs(['--file=custom/path.ts']);

    expect(result.filePath).toBe('custom/path.ts');
  });

  it('throws when --file has no value', () => {
    expect(() => parseRunArgs(['--file'])).toThrow('--file requires a path argument');
  });

  it('throws when --file= has an empty value', () => {
    expect(() => parseRunArgs(['--file='])).toThrow('--file requires a path argument');
  });

  // --from flag
  it('parses --from flag', () => {
    const result = parseRunArgs(['--from', 'github:org/repo']);

    expect(result.fromValue).toBe('github:org/repo');
  });

  it('throws when --from has no value', () => {
    expect(() => parseRunArgs(['--from'])).toThrow('--from requires a source argument');
  });

  it('parses --from= syntax', () => {
    const result = parseRunArgs(['--from=github:org/repo']);

    expect(result.fromValue).toBe('github:org/repo');
  });

  it('throws when --from= has an empty value', () => {
    expect(() => parseRunArgs(['--from='])).toThrow('--from requires a source argument');
  });

  // --jit flag
  it('parses --jit flag', () => {
    const result = parseRunArgs(['--jit']);

    expect(result.jit).toBe(true);
  });

  it('parses -J as short form of --jit', () => {
    const result = parseRunArgs(['-J']);

    expect(result.jit).toBe(true);
  });

  // --internal flag
  it('parses --internal flag', () => {
    const result = parseRunArgs(['--internal']);

    expect(result.internal).toBe(true);
  });

  it('parses -i as short form of --internal', () => {
    const result = parseRunArgs(['-i']);

    expect(result.internal).toBe(true);
  });

  // --json flag
  it('parses --json flag', () => {
    const result = parseRunArgs(['--json']);

    expect(result.json).toBe(true);
    expect(result.kitSpecifiers).toStrictEqual([]);
  });

  it('parses --json with positional kit names', () => {
    const result = parseRunArgs(['--json', 'deploy']);

    expect(result.json).toBe(true);
    expect(result.kitSpecifiers).toStrictEqual([{ kitName: 'deploy', checklists: [] }]);
  });

  it('throws on unknown flags', () => {
    expect(() => parseRunArgs(['--unknown'])).toThrow("unknown flag '--unknown'");
  });

  // --config is no longer supported
  it('rejects --config as an unknown flag', () => {
    expect(() => parseRunArgs(['--config', 'x'])).toThrow("unknown flag '--config'");
  });

  // Short options
  it('parses -c as short form of --checklists', () => {
    const result = parseRunArgs(['-c', 'check1', '--file', 'path.ts']);

    expect(result.checklists).toStrictEqual(['check1']);
  });

  it('parses -f as short form of --file', () => {
    const result = parseRunArgs(['-f', 'custom/path.ts']);

    expect(result.filePath).toBe('custom/path.ts');
  });

  it('parses -u as short form of --url', () => {
    const result = parseRunArgs(['-u', 'https://example.com/config.js']);

    expect(result.urlValue).toBe('https://example.com/config.js');
  });

  it('parses -j as short form of --json', () => {
    const result = parseRunArgs(['-j']);

    expect(result.json).toBe(true);
  });

  it('parses -F as short form of --fail-on', () => {
    const result = parseRunArgs(['-F', 'warn']);

    expect(result.failOn).toBe('warn');
  });

  it('parses -R as short form of --report-on', () => {
    const result = parseRunArgs(['-R', 'error']);

    expect(result.reportOn).toBe('error');
  });

  // --url flag
  it('parses --url flag with space-separated value', () => {
    const result = parseRunArgs(['--url', 'https://example.com/config.js']);

    expect(result.urlValue).toBe('https://example.com/config.js');
  });

  it('parses --url= syntax', () => {
    const result = parseRunArgs(['--url=https://example.com/config.js']);

    expect(result.urlValue).toBe('https://example.com/config.js');
  });

  it('throws when --url has no value', () => {
    expect(() => parseRunArgs(['--url'])).toThrow('--url requires a URL argument');
  });

  it('throws when --url= has an empty value', () => {
    expect(() => parseRunArgs(['--url='])).toThrow('--url requires a URL argument');
  });

  // Mutual exclusivity
  it('throws when --file and --from are combined', () => {
    expect(() => parseRunArgs(['--file', 'path.ts', '--from', '/other/repo'])).toThrow(
      'Cannot combine --file, --from flags',
    );
  });

  it('throws when --file and --url are combined', () => {
    expect(() => parseRunArgs(['--file', 'path.ts', '--url', 'https://example.com/config.js'])).toThrow(
      'Cannot combine --file, --url flags',
    );
  });

  it('throws when --from and --url are combined', () => {
    expect(() => parseRunArgs(['--from', '/path', '--url', 'https://example.com/config.js'])).toThrow(
      'Cannot combine --from, --url flags',
    );
  });

  it('throws when --jit is combined with --from', () => {
    expect(() => parseRunArgs(['--jit', '--from', '/path'])).toThrow('--jit cannot be combined with --from');
  });

  it('throws when --jit is combined with --file', () => {
    expect(() => parseRunArgs(['--jit', '--file', 'path.ts'])).toThrow('--jit cannot be combined with --file');
  });

  it('throws when --internal is combined with --from', () => {
    expect(() => parseRunArgs(['--internal', '--from', '/path'])).toThrow('--internal cannot be combined with --from');
  });

  it('throws when --internal is combined with --url', () => {
    expect(() => parseRunArgs(['--internal', '--url', 'https://example.com'])).toThrow(
      '--internal cannot be combined with --url',
    );
  });

  it('throws when --jit is combined with --url', () => {
    expect(() => parseRunArgs(['--jit', '--url', 'https://example.com'])).toThrow(
      '--jit cannot be combined with --url',
    );
  });

  it('throws when --internal is combined with --file', () => {
    expect(() => parseRunArgs(['--internal', '--file', 'path.ts'])).toThrow(
      '--internal cannot be combined with --file',
    );
  });

  it('throws when a flag name is passed as value to another flag', () => {
    expect(() => parseRunArgs(['--from', '--url'])).toThrow('--from requires a source argument');
    expect(() => parseRunArgs(['--url', '--from'])).toThrow('--url requires a URL argument');
    expect(() => parseRunArgs(['--file', '--from'])).toThrow('--file requires a path argument');
  });

  // --fail-on flag
  it('parses --fail-on with valid severity', () => {
    const result = parseRunArgs(['--fail-on', 'warn']);

    expect(result.failOn).toBe('warn');
  });

  it('parses --fail-on= syntax', () => {
    const result = parseRunArgs(['--fail-on=recommend']);

    expect(result.failOn).toBe('recommend');
  });

  it('throws when --fail-on has an invalid value', () => {
    expect(() => parseRunArgs(['--fail-on', 'critical'])).toThrow(
      '--fail-on must be one of: error, warn, recommend (got "critical")',
    );
  });

  it('throws when --fail-on has no value', () => {
    expect(() => parseRunArgs(['--fail-on'])).toThrow('--fail-on requires a severity level');
  });

  // --report-on flag
  it('parses --report-on with valid severity', () => {
    const result = parseRunArgs(['--report-on', 'error']);

    expect(result.reportOn).toBe('error');
  });

  it('parses --report-on= syntax', () => {
    const result = parseRunArgs(['--report-on=warn']);

    expect(result.reportOn).toBe('warn');
  });

  it('throws when --report-on has an invalid value', () => {
    expect(() => parseRunArgs(['--report-on', 'debug'])).toThrow(
      '--report-on must be one of: error, warn, recommend (got "debug")',
    );
  });

  it('throws when --report-on has no value', () => {
    expect(() => parseRunArgs(['--report-on'])).toThrow('--report-on requires a severity level');
  });

  it('omits failOn and reportOn when not specified', () => {
    const result = parseRunArgs([]);

    expect(result).not.toHaveProperty('failOn');
    expect(result).not.toHaveProperty('reportOn');
  });
});

describe(resolveKitSources, () => {
  /** Build args with defaults for internal config. */
  function resolve(
    overrides: Partial<Parameters<typeof resolveKitSources>[0]> = {},
  ): ReturnType<typeof resolveKitSources> {
    return resolveKitSources({
      filePath: undefined,
      fromValue: undefined,
      urlValue: undefined,
      kitSpecifiers: [],
      checklists: undefined,
      jit: false,
      internal: false,
      internalDir: '.',
      internalInfix: undefined,
      ...overrides,
    });
  }

  // -- Default resolution (compiled .js) --

  it('resolves default kit path to .js', () => {
    expect(resolve()).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: [] },
    ]);
  });

  it('resolves named kit from positional specifier', () => {
    expect(resolve({ kitSpecifiers: [{ kitName: 'deploy', checklists: [] }] })).toStrictEqual([
      { name: 'deploy', source: { path: '.readyup/kits/deploy.js' }, checklists: [] },
    ]);
  });

  it('resolves slash-separated kit name', () => {
    expect(resolve({ kitSpecifiers: [{ kitName: 'shared/deploy', checklists: [] }] })).toStrictEqual([
      { name: 'shared/deploy', source: { path: '.readyup/kits/shared/deploy.js' }, checklists: [] },
    ]);
  });

  // -- --jit flag --

  it('resolves to .ts with --jit', () => {
    expect(resolve({ jit: true })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.ts' }, checklists: [] },
    ]);
  });

  // -- --internal flag --

  it('applies internal dir with --internal', () => {
    expect(resolve({ internal: true, internalDir: 'internal' })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/internal/default.js' }, checklists: [] },
    ]);
  });

  it('applies internal dir and infix with --internal', () => {
    expect(resolve({ internal: true, internalDir: 'internal', internalInfix: 'int' })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/internal/default.int.js' }, checklists: [] },
    ]);
  });

  it('combines --jit and --internal', () => {
    expect(resolve({ jit: true, internal: true, internalDir: 'internal', internalInfix: 'int' })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/internal/default.int.ts' }, checklists: [] },
    ]);
  });

  it('applies internal dir with named kit', () => {
    expect(
      resolve({
        kitSpecifiers: [{ kitName: 'deploy', checklists: [] }],
        internal: true,
        internalDir: 'internal',
        internalInfix: 'int',
      }),
    ).toStrictEqual([{ name: 'deploy', source: { path: '.readyup/kits/internal/deploy.int.js' }, checklists: [] }]);
  });

  // -- External sources without config fields --

  it('resolves --file without internalDir/internalInfix', () => {
    expect(
      resolveKitSources({
        filePath: 'custom/path.ts',
        fromValue: undefined,
        urlValue: undefined,
        kitSpecifiers: [],
        checklists: undefined,
        jit: false,
        internal: false,
      }),
    ).toStrictEqual([{ name: 'custom/path.ts', source: { path: 'custom/path.ts' }, checklists: [] }]);
  });

  it('resolves --url without internalDir/internalInfix', () => {
    expect(
      resolveKitSources({
        filePath: undefined,
        fromValue: undefined,
        urlValue: 'https://example.com/kit.js',
        kitSpecifiers: [],
        checklists: undefined,
        jit: false,
        internal: false,
      }),
    ).toStrictEqual([
      { name: 'https://example.com/kit.js', source: { url: 'https://example.com/kit.js' }, checklists: [] },
    ]);
  });

  it('resolves --from without internalDir/internalInfix', () => {
    expect(
      resolveKitSources({
        filePath: undefined,
        fromValue: 'github:org/repo',
        urlValue: undefined,
        kitSpecifiers: [{ kitName: 'deploy', checklists: [] }],
        checklists: undefined,
        jit: false,
        internal: false,
      }),
    ).toStrictEqual([
      {
        name: 'deploy',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/deploy.js' },
        checklists: [],
      },
    ]);
  });

  // -- --file flag --

  it('resolves --file to a single path source entry', () => {
    expect(resolve({ filePath: 'custom/path.ts' })).toStrictEqual([
      { name: 'custom/path.ts', source: { path: 'custom/path.ts' }, checklists: [] },
    ]);
  });

  it('resolves --file with --checklists', () => {
    expect(resolve({ filePath: 'custom/path.ts', checklists: ['c1', 'c2'] })).toStrictEqual([
      { name: 'custom/path.ts', source: { path: 'custom/path.ts' }, checklists: ['c1', 'c2'] },
    ]);
  });

  // -- --from github: --

  it('resolves --from github: without ref to a URL with main ref', () => {
    expect(
      resolve({ fromValue: 'github:org/repo', kitSpecifiers: [{ kitName: 'nmr', checklists: [] }] }),
    ).toStrictEqual([
      {
        name: 'nmr',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/nmr.js' },
        checklists: [],
      },
    ]);
  });

  it('resolves --from github: with ref', () => {
    expect(
      resolve({ fromValue: 'github:org/repo@v1', kitSpecifiers: [{ kitName: 'nmr', checklists: [] }] }),
    ).toStrictEqual([
      {
        name: 'nmr',
        source: { url: 'https://raw.githubusercontent.com/org/repo/v1/.readyup/kits/nmr.js' },
        checklists: [],
      },
    ]);
  });

  it('defaults --from github: kit to "default"', () => {
    expect(resolve({ fromValue: 'github:org/repo' })).toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/default.js' },
        checklists: [],
      },
    ]);
  });

  it('resolves multiple kits with --from github:', () => {
    expect(
      resolve({
        fromValue: 'github:org/repo',
        kitSpecifiers: [
          { kitName: 'deploy', checklists: [] },
          { kitName: 'infra', checklists: ['c1'] },
        ],
      }),
    ).toStrictEqual([
      {
        name: 'deploy',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/deploy.js' },
        checklists: [],
      },
      {
        name: 'infra',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/infra.js' },
        checklists: ['c1'],
      },
    ]);
  });

  // -- --from bitbucket: --

  it('resolves --from bitbucket: to a Bitbucket Cloud API source URL', () => {
    expect(
      resolve({ fromValue: 'bitbucket:myteam/deploy-checks', kitSpecifiers: [{ kitName: 'deploy', checklists: [] }] }),
    ).toStrictEqual([
      {
        name: 'deploy',
        source: {
          url: 'https://api.bitbucket.org/2.0/repositories/myteam/deploy-checks/src/main/.readyup/kits/deploy.js',
        },
        checklists: [],
      },
    ]);
  });

  it('resolves --from bitbucket: with ref', () => {
    expect(resolve({ fromValue: 'bitbucket:myteam/repo@v2' })).toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/v2/.readyup/kits/default.js' },
        checklists: [],
      },
    ]);
  });

  // -- --from local path --

  it('resolves --from with local path to a .js path under .readyup/kits/', () => {
    expect(resolve({ fromValue: '/path/to/repo' })).toStrictEqual([
      { name: 'default', source: { path: '/path/to/repo/.readyup/kits/default.js' }, checklists: [] },
    ]);
  });

  it('resolves --from with relative local path against cwd', () => {
    const expected = path.resolve(process.cwd(), '../sibling-repo');

    expect(resolve({ fromValue: '../sibling-repo' })).toStrictEqual([
      { name: 'default', source: { path: `${expected}/.readyup/kits/default.js` }, checklists: [] },
    ]);
  });

  it('resolves multiple kits with --from local path', () => {
    expect(
      resolve({
        fromValue: '/path/to/repo',
        kitSpecifiers: [
          { kitName: 'deploy', checklists: [] },
          { kitName: 'infra', checklists: [] },
        ],
      }),
    ).toStrictEqual([
      { name: 'deploy', source: { path: '/path/to/repo/.readyup/kits/deploy.js' }, checklists: [] },
      { name: 'infra', source: { path: '/path/to/repo/.readyup/kits/infra.js' }, checklists: [] },
    ]);
  });

  // -- --from global --

  it('resolves --from global to home directory', () => {
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';

    expect(resolve({ fromValue: 'global' })).toStrictEqual([
      { name: 'default', source: { path: `${homeDir}/.readyup/kits/default.js` }, checklists: [] },
    ]);
  });

  // -- --from dir: --

  it('resolves --from dir: to an arbitrary directory', () => {
    const resolved = path.resolve(process.cwd(), 'custom/kits');

    expect(resolve({ fromValue: 'dir:custom/kits' })).toStrictEqual([
      { name: 'default', source: { path: `${resolved}/default.js` }, checklists: [] },
    ]);
  });

  // -- --url flag --

  it('resolves --url to a URL source', () => {
    expect(resolve({ urlValue: 'https://example.com/config.js' })).toStrictEqual([
      { name: 'https://example.com/config.js', source: { url: 'https://example.com/config.js' }, checklists: [] },
    ]);
  });

  it('resolves --url with --checklists', () => {
    expect(resolve({ urlValue: 'https://example.com/config.js', checklists: ['c1', 'c2'] })).toStrictEqual([
      {
        name: 'https://example.com/config.js',
        source: { url: 'https://example.com/config.js' },
        checklists: ['c1', 'c2'],
      },
    ]);
  });

  // -- Isolation of internal config with source flags --

  it('ignores internal config when --file is used', () => {
    expect(
      resolve({ filePath: 'custom/path.ts', internal: true, internalDir: 'internal', internalInfix: 'int' }),
    ).toStrictEqual([{ name: 'custom/path.ts', source: { path: 'custom/path.ts' }, checklists: [] }]);
  });

  it('ignores internal config when --from is used', () => {
    expect(
      resolve({ fromValue: 'github:org/repo', internal: false, internalDir: 'internal', internalInfix: 'int' }),
    ).toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/default.js' },
        checklists: [],
      },
    ]);
  });

  it('ignores internal config when --url is used', () => {
    expect(
      resolve({
        urlValue: 'https://example.com/config.js',
        internal: true,
        internalDir: 'internal',
        internalInfix: 'int',
      }),
    ).toStrictEqual([
      {
        name: 'https://example.com/config.js',
        source: { url: 'https://example.com/config.js' },
        checklists: [],
      },
    ]);
  });
});

describe(runCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockReportRdy.mockReturnValue('report output');
    mockFormatCombinedSummary.mockReturnValue('combined summary');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadRdyKit.mockReset();
    mockRunRdy.mockReset();
    mockReportRdy.mockReset();
    mockFormatCombinedSummary.mockReset();
    mockFormatJsonReport.mockReset();
    mockFormatJsonError.mockReset();
    mockResolveGitHubToken.mockReset();
    mockResolveBitbucketToken.mockReset();
    mockLoadRemoteKit.mockReset();
  });

  /** Build a single-kit entry for convenience. */
  function singleKitEntry(checklists: string[] = []) {
    return [{ name: 'default', source: { path: '.readyup/kits/default.js' }, checklists }];
  }

  it('runs all checklists when no checklist filter is given', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(mockRunRdy).toHaveBeenCalledTimes(2);
    expect(exitCode).toBe(0);
  });

  it('filters to named checklists only', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: singleKitEntry(['deploy']),
      json: false,
    });

    expect(mockRunRdy).toHaveBeenCalledTimes(1);
    expect(mockRunRdy).toHaveBeenCalledWith(
      kit.checklists[0],
      expect.objectContaining({ defaultSeverity: 'error', failOn: 'error' }),
    );
    expect(exitCode).toBe(0);
  });

  it('errors when an unknown checklist name is given', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);

    const exitCode = await runCommand({
      kitEntries: singleKitEntry(['nonexistent']),
      json: false,
    });

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown name(s): nonexistent'));
    expect(exitCode).toBe(1);
  });

  it('returns exit code 1 when any checklist fails', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy
      .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
      .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(exitCode).toBe(1);
  });

  it('passes kit path to local kit loader', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [{ name: 'custom', source: { path: 'custom/path.ts' }, checklists: [] }],
      json: false,
    });

    expect(mockLoadRdyKit).toHaveBeenCalledWith('custom/path.ts');
  });

  it('shows checklist headers when running multiple checklists in a single kit', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('--- deploy ---');
    expect(allOutput).toContain('--- infra ---');
  });

  it('does not show checklist headers for a single checklist', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(['deploy']),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain('---');
  });

  it('shows kit headers when running multiple kits', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('=== kit1 ===');
    expect(allOutput).toContain('=== kit2 ===');
  });

  it('does not print combined summary when running multiple kits', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
  });

  it('uses per-checklist fixLocation over kit default', async () => {
    const kit = makeKit({
      fixLocation: 'end',
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }], fixLocation: 'inline' }],
    });
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'inline' }));
  });

  it('falls back to kit-level fixLocation when checklist has none', async () => {
    const kit = makeKit({
      fixLocation: 'end',
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'end' }));
  });

  it('reports kit loading errors to stderr', async () => {
    mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

    const exitCode = await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(stderrSpy).toHaveBeenCalledWith('Error: Kit not found\n');
    expect(exitCode).toBe(1);
  });

  it('prints combined summary for a single kit with multiple checklists', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockFormatCombinedSummary.mockReturnValue('Combined summary');

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(mockFormatCombinedSummary).toHaveBeenCalledTimes(1);
    expect(mockFormatCombinedSummary).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'deploy' }), expect.objectContaining({ name: 'infra' })]),
    );
  });

  it('does not print combined summary for a single checklist', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(['deploy']),
      json: false,
    });

    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
  });

  // -- --jit error handling (Task 6) --

  it('throws friendly error when --jit kit import fails due to missing readyup', async () => {
    const moduleError = Object.assign(new Error("Cannot find package 'readyup'"), {
      code: 'MODULE_NOT_FOUND',
    });
    mockLoadRdyKit.mockRejectedValue(moduleError);

    const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: false }, true);

    expect(stderrSpy).toHaveBeenCalledWith(
      'Error: Running from source requires readyup to be installed as a project dependency.\n',
    );
    expect(exitCode).toBe(1);
  });

  it('passes through non-readyup module errors even with --jit', async () => {
    const moduleError = Object.assign(new Error("Cannot find package 'chalk'"), {
      code: 'MODULE_NOT_FOUND',
    });
    mockLoadRdyKit.mockRejectedValue(moduleError);

    const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: false }, true);

    expect(stderrSpy).toHaveBeenCalledWith("Error: Cannot find package 'chalk'\n");
    expect(exitCode).toBe(1);
  });

  it('passes through non-module errors with --jit', async () => {
    mockLoadRdyKit.mockRejectedValue(new Error('Syntax error in kit'));

    const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: false }, true);

    expect(stderrSpy).toHaveBeenCalledWith('Error: Syntax error in kit\n');
    expect(exitCode).toBe(1);
  });

  describe('threshold cascade', () => {
    it('uses CLI --fail-on flag over kit default', async () => {
      const kit = makeKit({ failOn: 'error' });
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: false,
        failOn: 'warn',
      });

      expect(mockRunRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failOn: 'warn' }));
    });

    it('falls back to kit failOn when CLI flag is absent', async () => {
      const kit = makeKit({ failOn: 'recommend' });
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: false,
      });

      expect(mockRunRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failOn: 'recommend' }));
    });

    it('falls back to kit reportOn when CLI flag is absent', async () => {
      const kit = makeKit({ reportOn: 'warn' });
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: false,
      });

      expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reportOn: 'warn' }));
    });

    it('passes reportOn to reportRdy', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: false,
        reportOn: 'warn',
      });

      expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reportOn: 'warn' }));
    });

    it('passes reportOn to formatJsonReport', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
      mockFormatJsonReport.mockReturnValue('{"worstSeverity":null}');

      await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: true,
        reportOn: 'error',
      });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reportOn: 'error' }),
      );
    });
  });

  describe('JSON mode', () => {
    beforeEach(() => {
      mockFormatJsonReport.mockReturnValue('{"worstSeverity":null}');
      mockFormatJsonError.mockReturnValue('{"error":"boom"}');
    });

    it('emits JSON output and no human-readable text', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const exitCode = await runCommand({
        kitEntries: singleKitEntry(),
        json: true,
      });

      expect(mockFormatJsonReport).toHaveBeenCalledTimes(1);
      expect(mockReportRdy).not.toHaveBeenCalled();
      expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalledWith('{"worstSeverity":null}\n');
      expect(exitCode).toBe(0);
    });

    it('returns exit code 1 when any checklist fails in JSON mode', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy
        .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
        .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

      const exitCode = await runCommand({
        kitEntries: singleKitEntry(),
        json: true,
      });

      expect(exitCode).toBe(1);
    });

    it('emits JSON error to stdout for kit loading errors', async () => {
      mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

      const exitCode = await runCommand({
        kitEntries: singleKitEntry(),
        json: true,
      });

      expect(mockFormatJsonError).toHaveBeenCalledWith('Kit not found');
      expect(stdoutSpy).toHaveBeenCalledWith('{"error":"boom"}\n');
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);
    });

    it('emits JSON error to stdout for unknown checklist names', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);

      const exitCode = await runCommand({
        kitEntries: singleKitEntry(['nonexistent']),
        json: true,
      });

      expect(mockFormatJsonError).toHaveBeenCalledWith(expect.stringContaining('Unknown name(s): nonexistent'));
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);
    });

    it('passes kit-grouped entries to formatJsonReport', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      const report1 = { results: [], passed: true, durationMs: 10 };
      const report2 = { results: [], passed: true, durationMs: 20 };
      mockRunRdy.mockResolvedValueOnce(report1).mockResolvedValueOnce(report2);

      await runCommand({
        kitEntries: singleKitEntry(),
        json: true,
      });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [
          {
            name: 'default',
            entries: [
              { name: 'deploy', report: report1 },
              { name: 'infra', report: report2 },
            ],
            passed: true,
          },
        ],
        expect.objectContaining({ reportOn: 'recommend' }),
      );
    });

    it('emits JSON error to stdout when runRdy throws', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockRejectedValue(new Error('runner crashed'));

      const exitCode = await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: true,
      });

      expect(mockFormatJsonError).toHaveBeenCalledWith('runner crashed');
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);
    });

    it('does not write headers in JSON mode', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        kitEntries: singleKitEntry(),
        json: true,
      });

      const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(allOutput).not.toContain('---');
    });

    it('produces JSON output with multiple kit entries', async () => {
      const kit = makeKit({
        checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
      });
      mockLoadRdyKit.mockResolvedValue(kit);
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      const exitCode = await runCommand({
        kitEntries: [
          { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
          { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
        ],
        json: true,
      });

      expect(mockFormatJsonReport).toHaveBeenCalledTimes(1);
      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'kit1' }), expect.objectContaining({ name: 'kit2' })]),
        expect.anything(),
      );
      expect(exitCode).toBe(0);
    });
  });

  // GitHub source tests (via URL with raw.githubusercontent.com)
  it('resolves token for GitHub raw URLs', async () => {
    const kit = makeKit();
    mockResolveGitHubToken.mockReturnValue('token-abc');
    mockLoadRemoteKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: [
        {
          name: 'nmr',
          source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/nmr.js' },
          checklists: [],
        },
      ],
      json: false,
    });

    expect(mockResolveGitHubToken).toHaveBeenCalled();
    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/nmr.js',
      headers: { Authorization: 'token token-abc' },
    });
    expect(exitCode).toBe(0);
  });

  it('omits token when resolveGitHubToken returns undefined for GitHub URLs', async () => {
    const kit = makeKit();
    mockResolveGitHubToken.mockReturnValue(undefined);
    mockLoadRemoteKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        {
          name: 'nmr',
          source: { url: 'https://raw.githubusercontent.com/org/repo/v2/.readyup/kits/nmr.js' },
          checklists: [],
        },
      ],
      json: false,
    });

    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://raw.githubusercontent.com/org/repo/v2/.readyup/kits/nmr.js',
    });
    expect(mockLoadRemoteKit.mock.calls[0][0]).not.toHaveProperty('headers');
  });

  // Bitbucket source tests (via URL with api.bitbucket.org)
  it('forwards Bitbucket token as Bearer Authorization for Bitbucket Cloud API URLs', async () => {
    const kit = makeKit();
    mockResolveBitbucketToken.mockReturnValue('bb-token-xyz');
    mockLoadRemoteKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: [
        {
          name: 'deploy',
          source: { url: 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/main/.readyup/kits/deploy.js' },
          checklists: [],
        },
      ],
      json: false,
    });

    expect(mockResolveBitbucketToken).toHaveBeenCalled();
    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/main/.readyup/kits/deploy.js',
      headers: { Authorization: 'Bearer bb-token-xyz' },
    });
    expect(exitCode).toBe(0);
  });

  it('omits Authorization when resolveBitbucketToken returns undefined for Bitbucket URLs', async () => {
    const kit = makeKit();
    mockResolveBitbucketToken.mockReturnValue(undefined);
    mockLoadRemoteKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        {
          name: 'deploy',
          source: { url: 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/v2/.readyup/kits/deploy.js' },
          checklists: [],
        },
      ],
      json: false,
    });

    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/v2/.readyup/kits/deploy.js',
    });
    expect(mockLoadRemoteKit.mock.calls[0][0]).not.toHaveProperty('headers');
  });

  it('reports a 404 for a Bitbucket URL with the URL in stderr', async () => {
    const url = 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/main/.readyup/kits/missing.js';
    mockResolveBitbucketToken.mockReturnValue(undefined);
    mockLoadRemoteKit.mockRejectedValue(new Error(`Failed to fetch remote kit from ${url}: 404 Not Found`));

    const exitCode = await runCommand({
      kitEntries: [{ name: 'missing', source: { url }, checklists: [] }],
      json: false,
    });

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(url));
    expect(exitCode).toBe(1);
  });

  it('reports a network failure for a Bitbucket URL with the URL in stderr', async () => {
    const url = 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/main/.readyup/kits/deploy.js';
    mockResolveBitbucketToken.mockReturnValue(undefined);
    // Raw fetch rejection — no URL in the error message; loadKit must inject it.
    mockLoadRemoteKit.mockRejectedValue(new TypeError('fetch failed'));

    const exitCode = await runCommand({
      kitEntries: [{ name: 'deploy', source: { url }, checklists: [] }],
      json: false,
    });

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(url));
    expect(exitCode).toBe(1);
  });

  // URL source tests
  it('fetches directly for non-GitHub URL source without token resolution', async () => {
    const kit = makeKit();
    mockLoadRemoteKit.mockResolvedValue(kit);
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: [{ name: 'config', source: { url: 'https://example.com/config.js' }, checklists: [] }],
      json: false,
    });

    expect(mockResolveGitHubToken).not.toHaveBeenCalled();
    expect(mockResolveBitbucketToken).not.toHaveBeenCalled();
    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://example.com/config.js',
    });
    expect(exitCode).toBe(0);
  });

  it('reports remote kit loading errors to stderr, prepending the URL when missing from the message', async () => {
    const url = 'https://example.com/config.js';
    mockLoadRemoteKit.mockRejectedValue(new Error('Failed to fetch remote kit'));

    const exitCode = await runCommand({
      kitEntries: [{ name: 'config', source: { url }, checklists: [] }],
      json: false,
    });

    expect(stderrSpy).toHaveBeenCalledWith(`Error: Failed to reach ${url}: Failed to fetch remote kit\n`);
    expect(exitCode).toBe(1);
  });
});
