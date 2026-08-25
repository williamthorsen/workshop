import { describe, expect, it } from 'vitest';

import type { KitSpecifier } from '../parseKitSpecifiers.ts';
import { type RunFlagConstraints, validateRunFlags } from '../validateRunFlags.ts';

describe(validateRunFlags, () => {
  it('accepts an invocation with no flags', () => {
    expect(() => validateRunFlags(buildConstraints(), [])).not.toThrow();
  });

  it.each([
    { flag: '--file', overrides: { file: 'path.ts' } },
    { flag: '--from', overrides: { from: '/path' } },
    { flag: '--packages', overrides: { packages: true } },
    { flag: '--url', overrides: { url: 'https://example.com/kit.js' } },
  ])('accepts $flag on its own', ({ overrides }) => {
    expect(() => validateRunFlags(buildConstraints(overrides), [])).not.toThrow();
  });

  describe('output flags', () => {
    it('rejects --detail without --json rather than ignoring it', () => {
      expect(() => validateRunFlags(buildConstraints({ detail: 'summary' }), [])).toThrow('--detail requires --json');
    });

    it('accepts --detail alongside --json', () => {
      expect(() => validateRunFlags(buildConstraints({ detail: 'summary', json: true }), [])).not.toThrow();
    });

    it('rejects --quiet with --json rather than ignoring it', () => {
      expect(() => validateRunFlags(buildConstraints({ json: true, quiet: true }), [])).toThrow(
        '--quiet cannot be combined with --json; it hides passed lines from human output only',
      );
    });
  });

  describe('source-flag exclusivity', () => {
    it.each([
      { label: '--file and --from', overrides: { file: 'path.ts', from: '/other/repo' }, message: '--file, --from' },
      {
        label: '--file and --url',
        overrides: { file: 'path.ts', url: 'https://example.com/config.js' },
        message: '--file, --url',
      },
      {
        label: '--from and --url',
        overrides: { from: '/path', url: 'https://example.com/config.js' },
        message: '--from, --url',
      },
      { label: '--from and --packages', overrides: { from: '/path', packages: true }, message: '--from, --packages' },
    ])('throws when $label are combined', ({ overrides, message }) => {
      expect(() => validateRunFlags(buildConstraints(overrides), [])).toThrow(`Cannot combine ${message} flags`);
    });
  });

  describe('mode flags', () => {
    it.each([
      { flag: '--file', overrides: { file: 'path.ts' } },
      { flag: '--from', overrides: { from: '/path' } },
      { flag: '--packages', overrides: { packages: true } },
      { flag: '--url', overrides: { url: 'https://example.com' } },
    ])('throws when --jit is combined with $flag', ({ flag, overrides }) => {
      expect(() => validateRunFlags(buildConstraints({ ...overrides, jit: true }), [])).toThrow(
        `--jit cannot be combined with ${flag}`,
      );
    });

    it.each([
      { flag: '--file', overrides: { file: 'path.ts' } },
      { flag: '--from', overrides: { from: '/path' } },
      { flag: '--packages', overrides: { packages: true } },
      { flag: '--url', overrides: { url: 'https://example.com' } },
    ])('throws when --internal is combined with $flag', ({ flag, overrides }) => {
      expect(() => validateRunFlags(buildConstraints({ ...overrides, internal: true }), [])).toThrow(
        `--internal cannot be combined with ${flag}`,
      );
    });

    it.each(['jit', 'internal'] as const)('accepts --%s when no source flag is active', (flag) => {
      expect(() => validateRunFlags(buildConstraints({ [flag]: true }), [])).not.toThrow();
    });
  });

  describe('positional kit arguments', () => {
    it.each([
      { flag: '--file', overrides: { file: 'path.ts' } },
      { flag: '--url', overrides: { url: 'https://example.com/kit.js' } },
    ])('throws when $flag is combined with positional args', ({ flag, overrides }) => {
      expect(() => validateRunFlags(buildConstraints(overrides), [buildSpec('deploy')])).toThrow(
        `${flag} cannot be combined with positional kit arguments`,
      );
    });

    // The positional selects which kit runs in every configured package, so it narrows rather than competes.
    it('accepts a positional kit name alongside --packages', () => {
      expect(() => validateRunFlags(buildConstraints({ packages: true }), [buildSpec('deploy')])).not.toThrow();
    });
  });

  describe('--packages checklist selection', () => {
    it('throws when --packages is combined with --checklists', () => {
      expect(() => validateRunFlags(buildConstraints({ checklists: 'build', packages: true }), [])).toThrow(
        '--packages cannot be combined with --checklists; several configured packages may publish the named kit',
      );
    });

    // Unreachable while positionals were banned outright, and silently dropped if left unrejected.
    it('throws when --packages is combined with an inline checklist filter', () => {
      expect(() => validateRunFlags(buildConstraints({ packages: true }), [buildSpec('deploy', ['build'])])).toThrow(
        '--packages cannot be combined with the ":" checklist filter on "deploy"; ' +
          'several configured packages may publish the named kit',
      );
    });
  });

  describe('--checklists selection', () => {
    it('throws when --checklists is given more than one positional kit', () => {
      expect(() => validateRunFlags(buildConstraints({ checklists: 'x' }), [buildSpec('a'), buildSpec('b')])).toThrow(
        '--checklists requires a single kit, but 2 were given: a, b',
      );
    });

    it('throws when --checklists competes with a ":" filter on the positional kit', () => {
      expect(() =>
        validateRunFlags(buildConstraints({ checklists: 'test' }), [buildSpec('deploy', ['build'])]),
      ).toThrow('--checklists cannot be combined with the ":" checklist filter on "deploy"');
    });

    it.each([
      { flag: '--file', overrides: { file: 'path.ts' } },
      { flag: '--url', overrides: { url: 'https://example.com/kit.js' } },
    ])('accepts --checklists with $flag, which names its one kit implicitly', ({ overrides }) => {
      expect(() => validateRunFlags(buildConstraints({ ...overrides, checklists: 'check1' }), [])).not.toThrow();
    });

    it('accepts --checklists with a single unfiltered positional kit', () => {
      expect(() => validateRunFlags(buildConstraints({ checklists: 'build' }), [buildSpec('deploy')])).not.toThrow();
    });

    it('accepts --checklists with no positional kit, selecting within the default kit', () => {
      expect(() => validateRunFlags(buildConstraints({ checklists: 'build' }), [])).not.toThrow();
    });
  });
});

// region | Helpers

/** Builds a constraints object whose flags are all inactive, overridden by the given fields. */
function buildConstraints(overrides: Partial<RunFlagConstraints> = {}): RunFlagConstraints {
  return {
    checklists: undefined,
    detail: undefined,
    file: undefined,
    from: undefined,
    internal: false,
    jit: false,
    json: false,
    packages: false,
    quiet: false,
    url: undefined,
    ...overrides,
  };
}

/** Builds a kit specifier, unfiltered unless checklists are given. */
function buildSpec(kitName: string, checklists: string[] = []): KitSpecifier {
  return { kitName, checklists };
}

// endregion | Helpers
