import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { initWithCommit } from '../../test-utils/git-fixture.ts';
import { findReferences } from '../find-references.ts';

describe(findReferences, () => {
  it('reports the tracked lines, not the untracked files, of a clone that name an old path, and a clone that git cannot search', () => {
    using home = createTempTree(
      {
        'repos/tools/README.md': 'See ~/repos/app for the app.\nNot ~/repos/app-api.\n',
        'repos/plain/file.txt': '',
      },
      { prefix: 'repo-tools-' },
    );
    const homeDir = fs.realpathSync(home.dir);
    initWithCommit(`${homeDir}/repos/tools`);
    fs.writeFileSync(`${homeDir}/repos/tools/untracked.txt`, '~/repos/app\n');

    const report = findReferences(
      [`${homeDir}/repos/app`],
      [
        { dir: `${homeDir}/repos/tools`, label: 'tools' },
        { dir: `${homeDir}/repos/plain`, label: 'plain' },
      ],
      [],
      homeDir,
    );
    expect(report.references).toStrictEqual([
      { file: 'README.md', line: 1, location: 'tools', text: 'See ~/repos/app for the app.' },
    ]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toMatch(/^cannot search plain: fatal: not a git repository/);
  });
});
