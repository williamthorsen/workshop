import { describe, expect, it } from 'vitest';

import { KindLayoutSchema } from '../kind-layout-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

describe('KindLayoutSchema', () => {
  it('accepts one file per artifact', () => {
    const layout = { form: 'file', root: 'guidance/rulebooks', extension: '.md' };

    expect(KindLayoutSchema.parse(layout)).toStrictEqual(layout);
  });

  it('accepts one directory per artifact', () => {
    const layout = { form: 'directory', root: 'skills', entryFile: 'SKILL.md' };

    expect(KindLayoutSchema.parse(layout)).toStrictEqual(layout);
  });

  it('if the form is outside the known set, rejects the layout for that field', () => {
    expect(findIssuePaths(KindLayoutSchema, { form: 'glob', root: 'skills' })).toStrictEqual([['form']]);
  });

  it('if a file layout omits its extension, rejects the layout for that field', () => {
    expect(findIssuePaths(KindLayoutSchema, { form: 'file', root: 'guidance/rulebooks' })).toStrictEqual([
      ['extension'],
    ]);
  });
});
