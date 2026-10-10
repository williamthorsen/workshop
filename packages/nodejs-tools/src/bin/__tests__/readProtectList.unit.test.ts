import { UsageError } from '@williamthorsen/toolbelt.cli/candidate';
import { captureError, createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { parseProtectList, readProtectList } from '../readProtectList.ts';

const HOME = '/Users/me';

describe(parseProtectList, () => {
  it('skips comments and blank lines, trims whitespace, and expands ~', () => {
    const text = '# comment\n\n  ~/repos/atlassian/mcp-*  \n/opt/projects/keep\n~\n';

    expect(parseProtectList(text, HOME)).toStrictEqual([
      { glob: '/Users/me/repos/atlassian/mcp-*', pattern: '~/repos/atlassian/mcp-*' },
      { glob: '/opt/projects/keep', pattern: '/opt/projects/keep' },
      { glob: '/Users/me', pattern: '~' },
    ]);
  });

  it('drops a trailing slash from the glob', () => {
    expect(parseProtectList('~/repos/x/\n', HOME)).toStrictEqual([
      { glob: '/Users/me/repos/x', pattern: '~/repos/x/' },
    ]);
  });

  it('does not expand ~user', async () => {
    const error = await captureError(UsageError, () => parseProtectList('~other/repos\n', HOME));

    expect(error.message).toBe('Protect-list line 1 is neither absolute nor ~-prefixed: ~other/repos');
  });

  it('rejects a relative line, naming its number', async () => {
    const error = await captureError(UsageError, () => parseProtectList('# keep\nrepos/x\n', HOME));

    expect(error.message).toBe('Protect-list line 2 is neither absolute nor ~-prefixed: repos/x');
  });
});

describe(readProtectList, () => {
  it('reads and parses an existing file', () => {
    using tree = createTempTree({ 'list.txt': '~/repos/keep\n' });

    expect(readProtectList({ explicit: true, filePath: tree.resolve('list.txt'), homeDir: HOME })).toStrictEqual({
      entries: [{ glob: '/Users/me/repos/keep', pattern: '~/repos/keep' }],
      found: true,
    });
  });

  it('treats a missing default file as an empty list', () => {
    using tree = createTempTree({});

    expect(readProtectList({ explicit: false, filePath: tree.resolve('absent.txt'), homeDir: HOME })).toStrictEqual({
      entries: [],
      found: false,
    });
  });

  it('rejects a missing file that the user named', async () => {
    using tree = createTempTree({});
    const filePath = tree.resolve('absent.txt');

    const error = await captureError(UsageError, () => readProtectList({ explicit: true, filePath, homeDir: HOME }));

    expect(error.message).toBe(`Protect-list not found: ${filePath}`);
  });

  it('reports an unreadable file as a usage error', async () => {
    using tree = createTempTree({ 'dir/.keep': '' });
    const filePath = tree.resolve('dir');

    const error = await captureError(UsageError, () => readProtectList({ explicit: false, filePath, homeDir: HOME }));

    expect(error.message).toMatch(new RegExp(`^Cannot read protect-list ${filePath}: `));
  });
});
