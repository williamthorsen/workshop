import { describe, expect, it } from 'vitest';

import { isMissingFile } from '../isMissingFile.ts';

describe(isMissingFile, () => {
  it('reports a path that is not there', () => {
    expect(isMissingFile(Object.assign(new Error('nope'), { code: 'ENOENT' }))).toBe(true);
  });

  it('reports a probe below a path segment that is a regular file', () => {
    expect(isMissingFile(Object.assign(new Error('nope'), { code: 'ENOTDIR' }))).toBe(true);
  });

  it('does not report a permission failure, which a caller must surface rather than skip past', () => {
    expect(isMissingFile(Object.assign(new Error('denied'), { code: 'EACCES' }))).toBe(false);
  });

  it('does not report a value carrying no error code', () => {
    expect(isMissingFile(new Error('thrown by something else'))).toBe(false);
    expect(isMissingFile('not an error at all')).toBe(false);
    expect(isMissingFile(undefined)).toBe(false);
  });
});
