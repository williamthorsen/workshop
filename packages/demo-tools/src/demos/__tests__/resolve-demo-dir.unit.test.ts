import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { listDemoNames, resolveDemoDir } from '../resolve-demo-dir.ts';

const STORYBOARD = 'generated/storyboard.json';

describe(listDemoNames, () => {
  it('lists the sorted directories that contain a storyboard', () => {
    using tree = createTempTree({
      [`media/demos/zeta/${STORYBOARD}`]: '{}',
      [`media/demos/alpha/${STORYBOARD}`]: '{}',
      'media/demos/draft/notes.md': '',
      'media/demos/loose-file.json': '{}',
    });

    expect(listDemoNames(tree.resolve('media/demos'))).toStrictEqual(['alpha', 'zeta']);
  });

  it('returns an empty list when the demos directory does not exist', () => {
    using tree = createTempTree({});

    expect(listDemoNames(tree.resolve('demos'))).toStrictEqual([]);
  });
});

describe(resolveDemoDir, () => {
  it.each([['quickstart'], ['quickstart/'], ['media/demos/quickstart'], ['./media/demos/quickstart/']])(
    'resolves %o under a nested demosDir',
    (argument) => {
      using tree = createTempTree({ [`media/demos/quickstart/${STORYBOARD}`]: '{}' });

      expect(resolveDemoDir(tree.dir, 'media/demos', argument)).toStrictEqual({
        found: true,
        demoDir: tree.resolve('media/demos/quickstart'),
      });
    },
  );

  it.each([['demos/quickstart'], ['other/quickstart'], ['media/quickstart'], ['unknown']])(
    'lists the demos for %o',
    (argument) => {
      using tree = createTempTree({ [`media/demos/quickstart/${STORYBOARD}`]: '{}' });

      expect(resolveDemoDir(tree.dir, 'media/demos', argument)).toStrictEqual({
        found: false,
        demoNames: ['quickstart'],
      });
    },
  );
});
