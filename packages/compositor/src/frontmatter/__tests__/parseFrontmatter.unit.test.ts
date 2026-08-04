import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '../parseFrontmatter.ts';

describe(parseFrontmatter, () => {
  it('splits the block from the body it delimits', () => {
    expect(parseFrontmatter('---\nname: reviewer\n---\nRead the diff.\n')).toStrictEqual({
      frontmatter: 'name: reviewer',
      body: 'Read the diff.\n',
      isUnterminated: false,
    });
  });

  it('if the block is empty, reports it as an empty block rather than as none', () => {
    expect(parseFrontmatter('---\n---\nBody\n')).toStrictEqual({
      frontmatter: '',
      body: 'Body\n',
      isUnterminated: false,
    });
  });

  it('if the content opens with something other than a delimiter, reports no block and keeps the whole content', () => {
    const content = '# Reviewer\n\nRead the diff.\n';

    expect(parseFrontmatter(content)).toStrictEqual({ frontmatter: undefined, body: content, isUnterminated: false });
  });

  it('does not read a horizontal rule below the first line as a block, which the ported original did', () => {
    const content = 'Some prose.\n\n---\n\nMore prose.\n\n---\n\nAnd more.\n';

    expect(parseFrontmatter(content)).toStrictEqual({ frontmatter: undefined, body: content, isUnterminated: false });
  });

  it('if the opening delimiter is never closed, reports the block unterminated rather than absent', () => {
    const content = '---\nname: reviewer\n';

    expect(parseFrontmatter(content)).toStrictEqual({ frontmatter: undefined, body: content, isUnterminated: true });
  });

  it('keeps a delimiter line inside the body, which belongs to the body and not to the block', () => {
    const parsed = parseFrontmatter('---\nname: reviewer\n---\nAbove.\n\n---\n\nBelow.\n');

    expect(parsed.body).toBe('Above.\n\n---\n\nBelow.\n');
  });
});
