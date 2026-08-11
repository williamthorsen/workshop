import assert from 'node:assert';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { FailedResult, PassedResult, RdyKit, Severity } from '../../kits/types.ts';
import type { SummaryRow } from '../../layout/layoutEngine.ts';
import { RemoteFetchError } from '../../remote/RemoteFetchError.ts';

const mockLoadRdyKit = vi.hoisted(() => vi.fn());
const mockRunRdy = vi.hoisted(() => vi.fn());
const mockReportRdy = vi.hoisted(() => vi.fn());
const mockFormatCombinedSummary = vi.hoisted(() => vi.fn<(rows: SummaryRow[]) => string>());
const mockFormatJsonReport = vi.hoisted(() => vi.fn());
const mockFormatJsonError = vi.hoisted(() => vi.fn());
const mockResolveGitHubToken = vi.hoisted(() => vi.fn());
const mockResolveBitbucketToken = vi.hoisted(() => vi.fn());
const mockLoadRemoteKit = vi.hoisted(() => vi.fn());

vi.mock(import('../../kits/loadRdyKit.ts'), () => ({
  loadRdyKit: mockLoadRdyKit,
}));

vi.mock(import('../runRdy.ts'), () => ({
  runRdy: mockRunRdy,
}));

vi.mock(import('../../reporting/reportRdy.ts'), async () => {
  const actual = await vi.importActual<typeof import('../../reporting/reportRdy.ts')>('../../reporting/reportRdy.ts');
  return {
    ...actual,
    reportRdy: mockReportRdy,
  };
});

vi.mock(import('../../reporting/formatCombinedSummary.ts'), () => ({
  formatCombinedSummary: mockFormatCombinedSummary,
}));

vi.mock(import('../../reporting/formatJsonReport.ts'), () => ({
  formatJsonReport: mockFormatJsonReport,
}));

vi.mock(import('../../reporting/formatJsonError.ts'), () => ({
  formatJsonError: mockFormatJsonError,
}));

vi.mock(import('../../remote/resolveGitHubToken.ts'), () => ({
  resolveGitHubToken: mockResolveGitHubToken,
}));

vi.mock(import('../../remote/resolveBitbucketToken.ts'), () => ({
  resolveBitbucketToken: mockResolveBitbucketToken,
}));

vi.mock(import('../../remote/loadRemoteKit.ts'), () => ({
  loadRemoteKit: mockLoadRemoteKit,
}));

import packageJson from '../../../package.json' with { type: 'json' };
import { parseRunArgs, resolveKitSources, runCommand } from '../runCommand.ts';

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

  it('parses --checklists with a single positional kit', () => {
    const result = parseRunArgs(['deploy', '--checklists', 'build,test']);

    expect(result.checklists).toStrictEqual(['build', 'test']);
    expect(result.kitSpecifiers).toStrictEqual([{ kitName: 'deploy', checklists: [] }]);
  });

  it('parses --checklists with no positional kit, selecting within the default kit', () => {
    const result = parseRunArgs(['--checklists', 'build']);

    expect(result.checklists).toStrictEqual(['build']);
    expect(result.kitSpecifiers).toStrictEqual([]);
  });

  it('parses --checklists with --from and a single positional kit', () => {
    const result = parseRunArgs(['--checklists', 'check1', '--from', 'github:org/repo', 'deploy']);

    expect(result.checklists).toStrictEqual(['check1']);
  });

  it('throws when --checklists competes with a ":" filter on the positional kit', () => {
    expect(() => parseRunArgs(['deploy:build', '--checklists', 'test'])).toThrow(
      '--checklists cannot be combined with the ":" checklist filter on "deploy"',
    );
  });

  it.each([
    { label: 'no value', args: ['--checklists='] },
    { label: 'only separators', args: ['--checklists', ',,,'] },
    { label: 'only separators alongside a kit', args: ['deploy', '--checklists', ','] },
  ])('throws when --checklists is given $label', ({ args }) => {
    expect(() => parseRunArgs(args)).toThrow('--checklists requires a comma-separated list of checklist names');
  });

  it('throws when --checklists is given more than one positional kit', () => {
    expect(() => parseRunArgs(['a', 'b', '--checklists', 'x'])).toThrow(
      '--checklists requires a single kit, but 2 were given: a, b',
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

  // --internal flag
  it('parses --internal flag', () => {
    const result = parseRunArgs(['--internal']);

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
    expect(() => parseRunArgs(['--unknown'])).toThrow("Unknown option '--unknown'");
  });

  // --config is no longer supported
  it('rejects --config as an unknown flag', () => {
    expect(() => parseRunArgs(['--config', 'x'])).toThrow("Unknown option '--config'");
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

  it.each(['-J', '-F', '-R', '-i', '-u', '-j'])('rejects the retired short flag %s', (short) => {
    expect(() => parseRunArgs([short])).toThrow(`Unknown option '${short}'`);
  });

  it.each([
    { long: '--internal', args: ['--internal'], expected: { internal: true } },
    { long: '--jit', args: ['--jit'], expected: { jit: true } },
    { long: '--json', args: ['--json'], expected: { json: true } },
    { long: '--fail-on', args: ['--fail-on', 'warn'], expected: { failOn: 'warn' } },
    { long: '--report-on', args: ['--report-on', 'error'], expected: { reportOn: 'error' } },
    {
      long: '--url',
      args: ['--url', 'https://example.com/kit.js'],
      expected: { urlValue: 'https://example.com/kit.js' },
    },
  ])('keeps $long working after its short is retired', ({ args, expected }) => {
    expect(parseRunArgs(args)).toMatchObject(expected);
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

  it('throws when --from and --packages are combined', () => {
    expect(() => parseRunArgs(['--packages', '--from', '/path'])).toThrow('Cannot combine --from, --packages flags');
  });

  // The positional selects which kit runs in every configured package, so it narrows rather than competes.
  it('accepts a positional kit name alongside --packages', () => {
    expect(parseRunArgs(['--packages', 'deploy']).kitSpecifiers).toStrictEqual([{ kitName: 'deploy', checklists: [] }]);
  });

  it('throws when --packages is combined with --checklists', () => {
    expect(() => parseRunArgs(['--packages', '--checklists', 'build'])).toThrow(
      '--packages cannot be combined with --checklists; several configured packages may publish the named kit',
    );
  });

  // Unreachable while positionals were banned outright, and silently dropped if left unrejected.
  it('throws when --packages is combined with an inline checklist filter', () => {
    expect(() => parseRunArgs(['--packages', 'deploy:build'])).toThrow(
      '--packages cannot be combined with the ":" checklist filter on "deploy"; ' +
        'several configured packages may publish the named kit',
    );
  });

  it('throws when --jit is combined with --packages', () => {
    expect(() => parseRunArgs(['--jit', '--packages'])).toThrow('--jit cannot be combined with --packages');
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

  // --detail flag
  it.each(['summary', 'full'])('parses --detail %s', (projection) => {
    expect(parseRunArgs(['--json', '--detail', projection])).toMatchObject({ detail: projection });
  });

  it('parses --detail= syntax', () => {
    expect(parseRunArgs(['--json', '--detail=summary'])).toMatchObject({ detail: 'summary' });
  });

  it('throws when --detail has an invalid value', () => {
    expect(() => parseRunArgs(['--json', '--detail', 'terse'])).toThrow(
      '--detail must be one of: summary, full (got "terse")',
    );
  });

  it('throws when --detail has no value', () => {
    expect(() => parseRunArgs(['--json', '--detail'])).toThrow('--detail requires a projection');
  });

  it('rejects --detail without --json rather than ignoring it', () => {
    expect(() => parseRunArgs(['--detail', 'summary'])).toThrow('--detail requires --json');
  });

  it('omits detail when not specified', () => {
    expect(parseRunArgs(['--json'])).not.toHaveProperty('detail');
  });
});

describe('--quiet', () => {
  it('parses as a boolean', () => {
    expect(parseRunArgs(['--quiet']).quiet).toBe(true);
  });

  it('defaults to false', () => {
    expect(parseRunArgs([]).quiet).toBe(false);
  });

  it('rejects --quiet with --json rather than ignoring it', () => {
    expect(() => parseRunArgs(['--quiet', '--json'])).toThrow(
      '--quiet cannot be combined with --json; it hides passed lines from human output only',
    );
  });

  it('composes with --report-on, which filters on a different axis', () => {
    const parsed = parseRunArgs(['--quiet', '--report-on', 'warn']);

    expect(parsed.quiet).toBe(true);
    expect(parsed.reportOn).toBe('warn');
  });

  it('composes with a kit selection', () => {
    const parsed = parseRunArgs(['--quiet', 'deploy']);

    expect(parsed.quiet).toBe(true);
    expect(parsed.kitSpecifiers).toStrictEqual([{ kitName: 'deploy', checklists: [] }]);
  });
});

/** Repo root, which is where the workspace link for `readyup` lives. */
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

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

  it('applies --checklists to the named kit', () => {
    expect(
      resolve({ kitSpecifiers: [{ kitName: 'deploy', checklists: [] }], checklists: ['build', 'test'] }),
    ).toStrictEqual([{ name: 'deploy', source: { path: '.readyup/kits/deploy.js' }, checklists: ['build', 'test'] }]);
  });

  it('applies --checklists to the default kit when no kit is named', () => {
    expect(resolve({ checklists: ['build'] })).toStrictEqual([
      { name: 'default', source: { path: '.readyup/kits/default.js' }, checklists: ['build'] },
    ]);
  });

  // -- npm: source --

  // `readyup` is linked into this repo's node_modules as a workspace package, so it stands in for any
  // installed dependency without needing a fixture.
  it('resolves a kit inside an installed package', () => {
    const [entry] = resolve({ fromValue: 'npm:readyup' });

    expect(entry?.name).toBe('default');
    expect(entry?.source).toStrictEqual({
      path: path.join(REPO_ROOT, 'packages', 'readyup', '.readyup', 'kits', 'default.js'),
    });
  });

  it('resolves a named kit inside an installed package', () => {
    const [entry] = resolve({ fromValue: 'npm:readyup', kitSpecifiers: [{ kitName: 'drift', checklists: [] }] });

    expect(entry?.source).toStrictEqual({
      path: path.join(REPO_ROOT, 'packages', 'readyup', '.readyup', 'kits', 'drift.js'),
    });
  });

  // The provenance is what names the copy a check ran against, which is the whole point of resolving from an
  // installed package. It reads from the same manifest the resolver reads, so a version bump leaves this alone.
  it('carries the package and its installed version as the kit provenance', () => {
    const [entry] = resolve({ fromValue: 'npm:readyup' });

    expect(entry?.provenance).toStrictEqual({
      kind: 'package',
      packageName: 'readyup',
      version: packageJson.version,
    });
  });

  it('rejects a version spec by naming the flag that reaches a published kit', () => {
    expect(() => resolve({ fromValue: 'npm:readyup@0.22.0' })).toThrow(/not supported yet[\s\S]*--url/);
  });

  it('rejects an uninstalled package by naming the direct-dependency requirement', () => {
    expect(() => resolve({ fromValue: 'npm:readyup-package-that-does-not-exist' })).toThrow(
      /is not installed; it must be a direct dependency/,
    );
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
    ).toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
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
      {
        name: 'kit',
        source: { url: 'https://example.com/kit.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'example.com/kit.js' },
      },
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
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
      },
    ]);
  });

  // -- --file flag --

  it('resolves --file to a single path source entry', () => {
    expect(resolve({ filePath: 'custom/path.ts' })).toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
  });

  it('resolves --file with --checklists', () => {
    expect(resolve({ filePath: 'custom/path.ts', checklists: ['c1', 'c2'] })).toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: ['c1', 'c2'],
        provenance: { kind: 'directory', label: 'custom' },
      },
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
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
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
        provenance: { kind: 'remote', label: 'github:org/repo@v1' },
      },
    ]);
  });

  it('defaults --from github: kit to "default"', () => {
    expect(resolve({ fromValue: 'github:org/repo' })).toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/default.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
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
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
      },
      {
        name: 'infra',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/infra.js' },
        checklists: ['c1'],
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
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
        provenance: { kind: 'remote', label: 'bitbucket:myteam/deploy-checks@main' },
      },
    ]);
  });

  it('resolves --from bitbucket: with ref', () => {
    expect(resolve({ fromValue: 'bitbucket:myteam/repo@v2' })).toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/v2/.readyup/kits/default.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'bitbucket:myteam/repo@v2' },
      },
    ]);
  });

  // -- --from local path --

  it('resolves --from with local path to a .js path under .readyup/kits/', () => {
    expect(resolve({ fromValue: '/path/to/repo' })).toStrictEqual([
      {
        name: 'default',
        source: { path: '/path/to/repo/.readyup/kits/default.js' },
        checklists: [],
        provenance: { kind: 'directory', label: '/path/to/repo/.readyup/kits' },
      },
    ]);
  });

  it('resolves --from with relative local path against cwd', () => {
    const expected = path.resolve(process.cwd(), '../sibling-repo');

    expect(resolve({ fromValue: '../sibling-repo' })).toStrictEqual([
      {
        name: 'default',
        source: { path: `${expected}/.readyup/kits/default.js` },
        checklists: [],
        provenance: { kind: 'directory', label: '../sibling-repo/.readyup/kits' },
      },
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
      {
        name: 'deploy',
        source: { path: '/path/to/repo/.readyup/kits/deploy.js' },
        checklists: [],
        provenance: { kind: 'directory', label: '/path/to/repo/.readyup/kits' },
      },
      {
        name: 'infra',
        source: { path: '/path/to/repo/.readyup/kits/infra.js' },
        checklists: [],
        provenance: { kind: 'directory', label: '/path/to/repo/.readyup/kits' },
      },
    ]);
  });

  // -- --from global --

  it('resolves --from global to home directory', () => {
    const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '~';

    expect(resolve({ fromValue: 'global' })).toStrictEqual([
      {
        name: 'default',
        source: { path: `${homeDir}/.readyup/kits/default.js` },
        checklists: [],
        provenance: { kind: 'directory', label: '~/.readyup/kits' },
      },
    ]);
  });

  // -- --from dir: --

  it('resolves --from dir: to an arbitrary directory', () => {
    const resolved = path.resolve(process.cwd(), 'custom/kits');

    expect(resolve({ fromValue: 'dir:custom/kits' })).toStrictEqual([
      {
        name: 'default',
        source: { path: `${resolved}/default.js` },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom/kits' },
      },
    ]);
  });

  // -- --url flag --

  it('resolves --url to a URL source', () => {
    expect(resolve({ urlValue: 'https://example.com/config.js' })).toStrictEqual([
      {
        name: 'config',
        source: { url: 'https://example.com/config.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'example.com/config.js' },
      },
    ]);
  });

  it('resolves --url with --checklists', () => {
    expect(resolve({ urlValue: 'https://example.com/config.js', checklists: ['c1', 'c2'] })).toStrictEqual([
      {
        name: 'config',
        source: { url: 'https://example.com/config.js' },
        checklists: ['c1', 'c2'],
        provenance: { kind: 'remote', label: 'example.com/config.js' },
      },
    ]);
  });

  // -- Isolation of internal config with source flags --

  it('ignores internal config when --file is used', () => {
    expect(
      resolve({ filePath: 'custom/path.ts', internal: true, internalDir: 'internal', internalInfix: 'int' }),
    ).toStrictEqual([
      {
        name: 'path',
        source: { path: 'custom/path.ts' },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom' },
      },
    ]);
  });

  it('ignores internal config when --from is used', () => {
    expect(
      resolve({ fromValue: 'github:org/repo', internal: false, internalDir: 'internal', internalInfix: 'int' }),
    ).toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/default.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
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
        name: 'config',
        source: { url: 'https://example.com/config.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'example.com/config.js' },
      },
    ]);
  });
});

/**
 * The blank line parting one block from the next, as it reads in concatenated stdout writes.
 *
 * The count includes the newline terminating the block above, so the gap a reader sees is one blank fewer.
 */
const BLOCK_GAP = '\n'.repeat(2);

/** A gap wider than one blank line, which no boundary opens. */
const WIDER_GAP = '\n'.repeat(3);

describe(runCommand, () => {
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: true });
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

  /** Every stderr write concatenated into one string. */
  function stderrText(): string {
    return stderrSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  it('runs all checklists when no checklist filter is given', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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

  it('reports an unknown checklist name against its kit and exits 2', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });

    const exitCode = await runCommand({ kitEntries: singleKitEntry(['nonexistent']), json: false });

    expect(exitCode).toBe(2);
    expect(stderrText()).toContain('Error: Unknown name(s): nonexistent');
  });

  it('returns exit code 1 when any checklist fails', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [{ name: 'custom', source: { path: 'custom/path.ts' }, checklists: [] }],
      json: false,
    });

    expect(mockLoadRdyKit).toHaveBeenCalledWith('custom/path.ts');
  });

  it('shows checklist headers when running multiple checklists in a single kit', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4CB} deploy');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4CB} infra');
  });

  // One blank parts blocks of the same kit, and the summary that tallies them is parted the same way.
  it('parts one block from the next with a single blank line', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain(WIDER_GAP);
    expect(allOutput).toContain(`${BLOCK_GAP}\u{2501}\u{2501} \u{1F4CB} infra`);
    expect(allOutput).toContain(`${BLOCK_GAP}combined summary`);
  });

  // A lone local kit running one checklist has no source to name, nothing to be told apart from, and one
  // checklist to report, so its breadcrumb would carry no segment at all. It heads nothing, and it opens
  // with no blank line either.
  it('heads nothing at all for a lone local kit running one checklist', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(['deploy']),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain('\u{2501}\u{2501}');
    expect(allOutput).not.toContain('\u{2500}\u{2500} ');
    expect(allOutput.startsWith('\n')).toBe(false);
  });

  it('shows kit headers when running multiple kits', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4D3} kit1');
    expect(allOutput).toContain('\u{2501}\u{2501} \u{1F4D3} kit2');
  });

  // The heading below a gap names the kit it opens, so a kit boundary takes the same one blank line every
  // other boundary takes. The run's first block opens with none.
  it('parts one kit from the next with the same single blank line, opening with none', async () => {
    const kit = makeKit({
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput.startsWith('\u{2501}\u{2501} \u{1F4D3} kit1')).toBe(true);
    expect(allOutput).toContain(`${BLOCK_GAP}\u{2501}\u{2501} \u{1F4D3} kit2`);
    expect(allOutput).not.toContain(WIDER_GAP);
  });

  // A bodiless block states nothing its table row does not, so it goes and the row reports it.
  it('leaves out a block whose tree rendered nothing', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain('report output');
    expect(allOutput).toContain('combined summary');
  });

  // Nothing tabulates a run of one checklist, so its block stands however little it has to say.
  it('keeps a bodiless block when the run will tabulate nothing', async () => {
    const kit = makeKit({ checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('report output');
    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
  });

  // The row is the only report a dropped block gets, so it is tabulated even with no sibling row beside it.
  it('tabulates a dropped block even when one row is all that survives', async () => {
    const kit = makeKit({ checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }] });
    mockLoadRdyKit.mockResolvedValueOnce({ kit, compileTimeVersion: undefined });
    mockLoadRdyKit.mockRejectedValueOnce(new Error('kit2 cannot be read'));
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockReportRdy.mockReturnValue({ body: 'report output', hasVisibleResults: false });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    const allOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).not.toContain('report output');
    expect(allOutput).toContain('combined summary');
  });

  it('prints one combined summary covering every kit in a multi-kit run', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    expect(mockFormatCombinedSummary).toHaveBeenCalledTimes(1);
    expect(mockFormatCombinedSummary.mock.calls[0]?.[0].map((row) => row.segments)).toStrictEqual([
      [
        { role: 'kit', text: 'kit1' },
        { role: 'checklist', text: 'deploy' },
      ],
      [
        { role: 'kit', text: 'kit1' },
        { role: 'checklist', text: 'infra' },
      ],
      [
        { role: 'kit', text: 'kit2' },
        { role: 'checklist', text: 'deploy' },
      ],
      [
        { role: 'kit', text: 'kit2' },
        { role: 'checklist', text: 'infra' },
      ],
    ]);
  });

  // A kit running one checklist heads its block without naming it, and still belongs in the run's tally.
  it('gives a single-checklist kit a row of its own in a multi-kit run', async () => {
    mockLoadRdyKit.mockResolvedValue({
      kit: makeKit({ checklists: [{ name: 'only', checks: [{ name: 'a', check: () => true }] }] }),
      compileTimeVersion: undefined,
    });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        { name: 'kit1', source: { path: '.readyup/kits/kit1.js' }, checklists: [] },
        { name: 'kit2', source: { path: '.readyup/kits/kit2.js' }, checklists: [] },
      ],
      json: false,
    });

    expect(mockFormatCombinedSummary.mock.calls[0]?.[0].map((row) => row.segments)).toStrictEqual([
      [{ role: 'kit', text: 'kit1' }],
      [{ role: 'kit', text: 'kit2' }],
    ]);
  });

  it('uses per-checklist fixLocation over kit default', async () => {
    const kit = makeKit({
      fixLocation: 'end',
      checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }], fixLocation: 'inline' }],
    });
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixLocation: 'end' }));
  });

  it('reports an unloadable kit against its kit name and exits 2', async () => {
    mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));

    const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: false });

    expect(exitCode).toBe(2);
    expect(stderrText()).toBe('Error: Kit not found\n');
  });

  it('prints combined summary for a single kit with multiple checklists', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });
    mockFormatCombinedSummary.mockReturnValue('Combined summary');

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
    });

    expect(mockFormatCombinedSummary).toHaveBeenCalledTimes(1);
    expect(mockFormatCombinedSummary.mock.calls[0]?.[0].map((row) => row.segments)).toStrictEqual([
      [{ role: 'checklist', text: 'deploy' }],
      [{ role: 'checklist', text: 'infra' }],
    ]);
  });

  it('counts results pruned by the reporting threshold in each combined-summary row', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({
      results: [makePassedResult('gate', 'error'), makeFailedResult('lint', 'warn')],
      passed: true,
      durationMs: 0,
    });

    await runCommand({
      kitEntries: singleKitEntry(),
      json: false,
      reportOn: 'error',
    });

    expect(mockFormatCombinedSummary).toHaveBeenCalledWith([
      expect.objectContaining({
        counts: expect.objectContaining({ passed: 1, warnings: 1, worstSeverity: 'warn' }),
        segments: [{ role: 'checklist', text: 'deploy' }],
      }),
      expect.objectContaining({
        counts: expect.objectContaining({ passed: 1, warnings: 1, worstSeverity: 'warn' }),
        segments: [{ role: 'checklist', text: 'infra' }],
      }),
    ]);
  });

  it('does not print combined summary for a single checklist', async () => {
    const kit = makeKit();
    mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: singleKitEntry(['deploy']),
      json: false,
    });

    expect(mockFormatCombinedSummary).not.toHaveBeenCalled();
  });

  // -- --jit error handling (Task 6) --

  it('reports a friendly message when a --jit kit import fails due to missing readyup', async () => {
    const moduleError = Object.assign(new Error("Cannot find package 'readyup'"), {
      code: 'MODULE_NOT_FOUND',
    });
    mockLoadRdyKit.mockRejectedValue(moduleError);

    await runCommand({ kitEntries: singleKitEntry(), json: false }, true);

    expect(stderrText()).toBe('Error: Running from source requires readyup to be installed as a project dependency.\n');
  });

  it('passes through non-readyup module errors even with --jit', async () => {
    const moduleError = Object.assign(new Error("Cannot find package 'chalk'"), {
      code: 'MODULE_NOT_FOUND',
    });
    mockLoadRdyKit.mockRejectedValue(moduleError);

    await runCommand({ kitEntries: singleKitEntry(), json: false }, true);

    expect(stderrText()).toBe("Error: Cannot find package 'chalk'\n");
  });

  it('passes through non-module errors with --jit', async () => {
    mockLoadRdyKit.mockRejectedValue(new Error('Syntax error in kit'));

    await runCommand({ kitEntries: singleKitEntry(), json: false }, true);

    expect(stderrText()).toBe('Error: Syntax error in kit\n');
  });

  describe('threshold cascade', () => {
    it('uses CLI --fail-on flag over kit default', async () => {
      const kit = makeKit({ failOn: 'error' });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: false,
      });

      expect(mockRunRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failOn: 'recommend' }));
    });

    it('falls back to kit reportOn when CLI flag is absent', async () => {
      const kit = makeKit({ reportOn: 'warn' });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({
        kitEntries: singleKitEntry(['deploy']),
        json: false,
      });

      expect(mockReportRdy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reportOn: 'warn' }));
    });

    it('passes reportOn to reportRdy', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy
        .mockResolvedValueOnce({ results: [], passed: true, durationMs: 0 })
        .mockResolvedValueOnce({ results: [], passed: false, durationMs: 0 });

      const exitCode = await runCommand({
        kitEntries: singleKitEntry(),
        json: true,
      });

      expect(exitCode).toBe(1);
    });

    it('records an unloadable kit as an error entry, leaving stderr clean', async () => {
      mockLoadRdyKit.mockRejectedValue(new Error('Kit not found'));
      mockFormatJsonReport.mockReturnValue('{}');

      const exitCode = await runCommand({ kitEntries: singleKitEntry(), json: true });

      expect(exitCode).toBe(2);
      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [{ name: 'default', error: { code: 'kit-load', message: 'Kit not found' } }],
        expect.anything(),
      );
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('records an unknown checklist name as an error entry, leaving stderr clean', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockFormatJsonReport.mockReturnValue('{}');

      const exitCode = await runCommand({ kitEntries: singleKitEntry(['nonexistent']), json: true });

      expect(exitCode).toBe(2);
      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [{ name: 'default', error: { code: 'usage', message: expect.stringContaining('nonexistent') } }],
        expect.anything(),
      );
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('passes kit-grouped entries to formatJsonReport', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
            failOn: 'error',
            reportOn: 'recommend',
          },
        ],
        // A bare invocation requested no threshold, so the run-level options name none: the resolved
        // values reach the serializer on the kit that they governed.
        { detail: 'full' },
      );
    });

    it('sends a kit its own declared thresholds while the run level stays silent', async () => {
      const kit = makeKit({ failOn: 'warn', reportOn: 'error' });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({ kitEntries: singleKitEntry(), json: true });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [expect.objectContaining({ failOn: 'warn', reportOn: 'error' })],
        { detail: 'full' },
      );
    });

    it('echoes a threshold the invocation requested, which overrides what the kit declares', async () => {
      const kit = makeKit({ failOn: 'warn' });
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      await runCommand({ kitEntries: singleKitEntry(), json: true, failOn: 'recommend' });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [expect.objectContaining({ failOn: 'recommend' })],
        expect.objectContaining({ failOn: 'recommend' }),
      );
    });

    it('records an undiagnosed runner crash as an internal error entry', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
      mockRunRdy.mockRejectedValue(new Error('runner crashed'));
      mockFormatJsonReport.mockReturnValue('{}');

      const exitCode = await runCommand({ kitEntries: singleKitEntry(['deploy']), json: true });

      expect(exitCode).toBe(2);
      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [{ name: 'default', error: { code: 'internal', message: 'runner crashed' } }],
        expect.anything(),
      );
    });

    it('does not write headers in JSON mode', async () => {
      const kit = makeKit();
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
      mockLoadRdyKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
    mockLoadRemoteKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    const exitCode = await runCommand({
      kitEntries: [
        {
          name: 'nmr',
          source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/nmr.js' },
          checklists: [],
          provenance: { kind: 'remote', label: 'github:org/repo@main' },
        },
      ],
      json: false,
    });

    expect(mockResolveGitHubToken).toHaveBeenCalledWith();
    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/nmr.js',
      headers: { Authorization: 'token token-abc' },
    });
    expect(exitCode).toBe(0);
  });

  it('omits token when resolveGitHubToken returns undefined for GitHub URLs', async () => {
    const kit = makeKit();
    mockResolveGitHubToken.mockReturnValue(undefined);
    mockLoadRemoteKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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
    const [firstRemoteKitCall] = mockLoadRemoteKit.mock.calls;
    assert.ok(firstRemoteKitCall);
    expect(firstRemoteKitCall[0]).not.toHaveProperty('headers');
  });

  // Bitbucket source tests (via URL with api.bitbucket.org)
  it('forwards Bitbucket token as Bearer Authorization for Bitbucket Cloud API URLs', async () => {
    const kit = makeKit();
    mockResolveBitbucketToken.mockReturnValue('bb-token-xyz');
    mockLoadRemoteKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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

    expect(mockResolveBitbucketToken).toHaveBeenCalledWith();
    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/main/.readyup/kits/deploy.js',
      headers: { Authorization: 'Bearer bb-token-xyz' },
    });
    expect(exitCode).toBe(0);
  });

  it('omits Authorization when resolveBitbucketToken returns undefined for Bitbucket URLs', async () => {
    const kit = makeKit();
    mockResolveBitbucketToken.mockReturnValue(undefined);
    mockLoadRemoteKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
    mockRunRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

    await runCommand({
      kitEntries: [
        {
          name: 'deploy',
          source: { url: 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/v2/.readyup/kits/deploy.js' },
          checklists: [],
          provenance: { kind: 'remote', label: 'bitbucket:myteam/repo@v2' },
        },
      ],
      json: false,
    });

    expect(mockLoadRemoteKit).toHaveBeenCalledWith({
      url: 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/v2/.readyup/kits/deploy.js',
    });
    const [firstRemoteKitCall] = mockLoadRemoteKit.mock.calls;
    assert.ok(firstRemoteKitCall);
    expect(firstRemoteKitCall[0]).not.toHaveProperty('headers');
  });

  it('reports a 404 for a Bitbucket URL with the URL in the error message', async () => {
    const url = 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/main/.readyup/kits/missing.js';
    mockResolveBitbucketToken.mockReturnValue(undefined);
    mockLoadRemoteKit.mockRejectedValue(new Error(`Failed to fetch remote kit from ${url}: 404 Not Found`));

    await runCommand({ kitEntries: [{ name: 'missing', source: { url }, checklists: [] }], json: false });

    expect(stderrText()).toContain(url);
  });

  it('reports a network failure for a Bitbucket URL with the URL in the error message', async () => {
    const url = 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/main/.readyup/kits/deploy.js';
    mockResolveBitbucketToken.mockReturnValue(undefined);
    // Raw fetch rejection — no URL in the error message; loadKit must inject it.
    mockLoadRemoteKit.mockRejectedValue(new TypeError('fetch failed'));

    await runCommand({ kitEntries: [{ name: 'deploy', source: { url }, checklists: [] }], json: false });

    expect(stderrText()).toContain(url);
  });

  // URL source tests
  it('fetches directly for non-GitHub URL source without token resolution', async () => {
    const kit = makeKit();
    mockLoadRemoteKit.mockResolvedValue({ kit, compileTimeVersion: undefined });
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

  it('prepends the URL to a remote kit-load error message when it is missing', async () => {
    const url = 'https://example.com/config.js';
    mockLoadRemoteKit.mockRejectedValue(new Error('Failed to fetch remote kit'));

    await runCommand({ kitEntries: [{ name: 'config', source: { url }, checklists: [] }], json: false });

    expect(stderrText()).toBe(`Error: Failed to reach ${url}: Failed to fetch remote kit\n`);
  });

  it('forwards an install hint from a kit whose imports could not be resolved', async () => {
    mockLoadRdyKit.mockRejectedValue(
      Object.assign(new Error("Cannot resolve 'some-lib' while evaluating deploy.ts."), {
        hint: 'Install it with: pnpm add --save-dev some-lib',
      }),
    );

    await runCommand({ kitEntries: singleKitEntry(), json: false });

    expect(stderrText()).toBe(
      "Error: Cannot resolve 'some-lib' while evaluating deploy.ts.\n" +
        '\u{1F4A1} Hint: Install it with: pnpm add --save-dev some-lib\n',
    );
  });

  describe('credential hints', () => {
    const GITHUB_URL = 'https://raw.githubusercontent.com/acme/private/main/.readyup/kits/deploy.js';
    const BITBUCKET_URL = 'https://api.bitbucket.org/2.0/repositories/acme/private/src/main/.readyup/kits/deploy.js';
    const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';
    const BITBUCKET_HINT = 'If the repository is private, set BITBUCKET_TOKEN.';

    /** Runs one kit from `url` against a fetch that failed with `status`, and returns the rendered stderr. */
    async function runAgainstStatus(url: string, status: number): Promise<string> {
      mockLoadRemoteKit.mockRejectedValue(new RemoteFetchError(`Failed to fetch remote kit from ${url}`, status));
      await runCommand({ kitEntries: [{ name: 'deploy', source: { url }, checklists: [] }], json: false });
      return stderrText();
    }

    it.each([401, 403, 404])('hints at GITHUB_TOKEN on an unauthenticated %i from GitHub', async (status) => {
      mockResolveGitHubToken.mockReturnValue(undefined);

      await expect(runAgainstStatus(GITHUB_URL, status)).resolves.toContain(GITHUB_HINT);
    });

    it.each([401, 403, 404])('hints at BITBUCKET_TOKEN on an unauthenticated %i from Bitbucket', async (status) => {
      mockResolveBitbucketToken.mockReturnValue(undefined);

      await expect(runAgainstStatus(BITBUCKET_URL, status)).resolves.toContain(BITBUCKET_HINT);
    });

    it('puts the hint on a line of its own, below the error', async () => {
      mockResolveGitHubToken.mockReturnValue(undefined);

      await expect(runAgainstStatus(GITHUB_URL, 404)).resolves.toBe(
        `Error: Failed to fetch remote kit from ${GITHUB_URL}\n\u{1F4A1} Hint: ${GITHUB_HINT}\n`,
      );
    });

    it('stays silent when a token was forwarded', async () => {
      mockResolveGitHubToken.mockReturnValue('my-token');

      await expect(runAgainstStatus(GITHUB_URL, 404)).resolves.not.toContain('Hint');
    });

    it('stays silent for a third-party host, which readyup holds no credential for', async () => {
      await expect(runAgainstStatus('https://example.com/config.js', 404)).resolves.not.toContain('Hint');
    });

    it.each([500, 502])('stays silent on a %i, which no credential would fix', async (status) => {
      mockResolveGitHubToken.mockReturnValue(undefined);

      await expect(runAgainstStatus(GITHUB_URL, status)).resolves.not.toContain('Hint');
    });

    it('stays silent on a network failure, which reached no host to be refused by', async () => {
      mockResolveGitHubToken.mockReturnValue(undefined);
      mockLoadRemoteKit.mockRejectedValue(new TypeError('fetch failed'));

      await runCommand({
        kitEntries: [{ name: 'deploy', source: { url: GITHUB_URL }, checklists: [] }],
        json: false,
      });

      expect(stderrText()).not.toContain('Hint');
    });

    it('carries the hint into the JSON report’s kit error entry', async () => {
      mockResolveGitHubToken.mockReturnValue(undefined);
      mockLoadRemoteKit.mockRejectedValue(new RemoteFetchError('boom', 404));
      mockFormatJsonReport.mockReturnValue('{}');

      await runCommand({
        kitEntries: [{ name: 'deploy', source: { url: GITHUB_URL }, checklists: [] }],
        json: true,
      });

      expect(mockFormatJsonReport).toHaveBeenCalledWith(
        [{ name: 'deploy', error: { code: 'kit-load', message: 'boom', hint: GITHUB_HINT } }],
        expect.anything(),
      );
    });
  });
});

/** Builds a two-checklist kit named `deploy` and `infra`. */
function makeKit(overrides?: Partial<RdyKit>): RdyKit {
  return {
    checklists: [
      { name: 'deploy', checks: [{ name: 'a', check: () => true }] },
      { name: 'infra', checks: [{ name: 'b', check: () => true }] },
    ],
    ...overrides,
  };
}

/** Builds a passed result at the given severity. */
function makePassedResult(name: string, severity: Severity): PassedResult {
  return {
    name,
    status: 'passed',
    ok: true,
    severity,
    quiet: false,
    detail: null,
    fix: null,
    error: null,
    progress: null,
    durationMs: 0,
    depth: 0,
  };
}

/** Builds a failed result at the given severity. */
function makeFailedResult(name: string, severity: Severity): FailedResult {
  return {
    name,
    status: 'failed',
    ok: false,
    severity,
    quiet: false,
    detail: null,
    fix: null,
    error: null,
    progress: null,
    durationMs: 0,
    depth: 0,
  };
}
