import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { containsPath, findReferences } from '../find-references.ts';

describe(containsPath, () => {
  it.each([
    ['cd ~/a/workshop', true],
    ['~/a/workshop/src/index.ts', true],
    ['~/a/workshop.live/profiles', true],
    ['"~/a/workshop"', true],
    ['~/a/workshop-api', false],
    ['~/a/workshop_old', false],
    ['~/a/workshops', false],
    ['~/a/workshop-api and ~/a/workshop', true],
  ])('reads %j as naming ~/a/workshop: %s', (text, expected) => {
    expect(containsPath(text, '~/a/workshop')).toBe(expected);
  });
});

describe(findReferences, () => {
  it('reports text lines and symlinks under a search path, in ~ and absolute forms, skipping binary files', () => {
    using home = createTempTree(
      {
        'config/zshrc': 'export A=~/repos/app\nexport B=~/repos/app-api\n',
        'config/nested/settings.json': '',
        'config/blob.bin': 'x\0~/repos/app\n',
        'config/node_modules/pkg/index.js': '~/repos/app\n',
      },
      { prefix: 'repo-tools-' },
    );
    const homeDir = fs.realpathSync(home.dir);
    // The absolute form names the resolved home, which exists only once the tree does.
    fs.writeFileSync(`${homeDir}/config/nested/settings.json`, `{"root": "${homeDir}/repos/app.live/x"}\n`);
    home.symlink('config/linked', `${homeDir}/repos/app.live/profiles/zshrc`);
    home.symlink('config/unrelated', `${homeDir}/repos/application/x`);

    const report = findReferences(
      [`${homeDir}/repos/app`, `${homeDir}/repos/app.live`],
      [],
      ['~/config', '~/absent'],
      homeDir,
    );
    expect(report.problems).toStrictEqual(['cannot search ~/absent: ENOENT']);
    expect(sortReferences(report.references)).toStrictEqual([
      { file: 'linked', line: undefined, location: '~/config', text: `-> ${homeDir}/repos/app.live/profiles/zshrc` },
      { file: 'nested/settings.json', line: 1, location: '~/config', text: `{"root": "${homeDir}/repos/app.live/x"}` },
      { file: 'zshrc', line: 1, location: '~/config', text: 'export A=~/repos/app' },
    ]);
  });
});

// region | Helpers

/** Returns references sorted by file, since the walk's order follows the directory listing. */
function sortReferences<T extends { file: string }>(references: readonly T[]): T[] {
  return references.toSorted((left, right) => left.file.localeCompare(right.file));
}

// endregion | Helpers
