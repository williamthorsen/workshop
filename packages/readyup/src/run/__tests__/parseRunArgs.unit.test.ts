import { describe, expect, it } from 'vitest';

import { parseRunArgs } from '../parseRunArgs.ts';

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

  it.each([
    { label: 'no value', args: ['--checklists='] },
    { label: 'only separators', args: ['--checklists', ',,,'] },
    { label: 'only separators alongside a kit', args: ['deploy', '--checklists', ','] },
  ])('throws when --checklists is given $label', ({ args }) => {
    expect(() => parseRunArgs(args)).toThrow('--checklists requires a comma-separated list of checklist names');
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

  // Covers the delegation to `validateRunFlags`; the constraint matrix is covered against that module.
  it('throws when --file and --from are combined', () => {
    expect(() => parseRunArgs(['--file', 'path.ts', '--from', '/other/repo'])).toThrow(
      'Cannot combine --file, --from flags',
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
