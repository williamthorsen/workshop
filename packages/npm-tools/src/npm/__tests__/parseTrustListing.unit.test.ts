import { describe, expect, it } from 'vitest';

import { parseTrustListing, stripTerminalControls } from '../parseTrustListing.ts';

const GITHUB_ENTRY = {
  id: 'trust-1',
  type: 'github',
  file: 'release.yaml',
  repository: 'owner/old',
  environment: 'npm',
  permissions: ['createPackage', 'createStagedPackage'],
};

describe(parseTrustListing, () => {
  it('finds the entries in a recorded transcript beside the approval prompt, prose, and terminal noise', () => {
    const transcript = [
      '^D\b\b',
      toRecorded({ title: 'Authenticate your account at', url: 'https://www.npmjs.com/auth/cli/abc' }),
      '\u{1B}[33mnpm\u{1B}[39m \u{1B}[94mnotice\u{1B}[39m Open the URL {to} continue\r\n',
      '123456\r\n',
      toRecorded(GITHUB_ENTRY),
      toRecorded({ ...GITHUB_ENTRY, id: 'trust-2', repository: 'owner/other', environment: undefined }),
    ].join('');

    expect(parseTrustListing(transcript)).toStrictEqual({
      entries: [
        {
          environment: 'npm',
          file: 'release.yaml',
          id: 'trust-1',
          permissions: ['createPackage', 'createStagedPackage'],
          repository: 'owner/old',
        },
        {
          file: 'release.yaml',
          id: 'trust-2',
          permissions: ['createPackage', 'createStagedPackage'],
          repository: 'owner/other',
        },
      ],
      otherCount: 0,
    });
  });

  it('reads the elements of a top-level array', () => {
    expect(parseTrustListing(JSON.stringify([GITHUB_ENTRY])).entries).toHaveLength(1);
  });

  it('counts the entries that are not GitHub ones', () => {
    const transcript = toRecorded({ id: 'trust-3', type: 'circleci', 'org-id': 'x' }) + toRecorded(GITHUB_ENTRY);

    expect(parseTrustListing(transcript)).toMatchObject({ otherCount: 1 });
  });

  it('keeps braces inside JSON strings from ending a value', () => {
    const transcript = toRecorded({ ...GITHUB_ENTRY, environment: 'a}b{' });

    expect(parseTrustListing(transcript).entries[0]?.environment).toBe('a}b{');
  });

  it('defaults absent permissions to none and drops an absent file', () => {
    const transcript = toRecorded({ id: 'trust-4', repository: 'owner/old' });

    expect(parseTrustListing(transcript).entries).toStrictEqual([
      { id: 'trust-4', permissions: [], repository: 'owner/old' },
    ]);
  });

  it('finds nothing in a transcript without entries', () => {
    expect(parseTrustListing('No trust configurations found for package (x)\r\n')).toStrictEqual({
      entries: [],
      otherCount: 0,
    });
  });
});

describe(stripTerminalControls, () => {
  it('removes escape sequences and carriage returns, keeping newlines', () => {
    expect(stripTerminalControls('\u{1B}]0;title\u{7}a\u{1B}[1;31mb\u{1B}[0m\r\nc\b')).toBe('ab\nc');
  });
});

// region | Helpers

/** Renders a value as npm prints it, as recorded through a pseudo-terminal. */
function toRecorded(value: unknown): string {
  return `${JSON.stringify(value, null, 2).replaceAll('\n', '\r\n')}\r\n`;
}

// endregion | Helpers
