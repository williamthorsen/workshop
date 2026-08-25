import { describe, expect, it } from 'vitest';

import { reportsMissingPath } from '../reportsMissingPath.ts';

describe(reportsMissingPath, () => {
  it('reports a path that is not there', () => {
    expect(reportsMissingPath(Object.assign(new Error('nope'), { code: 'ENOENT' }))).toBe(true);
  });

  it('reports a probe below a path segment that is a regular file', () => {
    expect(reportsMissingPath(Object.assign(new Error('nope'), { code: 'ENOTDIR' }))).toBe(true);
  });

  it('does not report a permission failure, which a caller must surface rather than skip past', () => {
    expect(reportsMissingPath(Object.assign(new Error('denied'), { code: 'EACCES' }))).toBe(false);
  });

  it('does not report a value with no error code', () => {
    expect(reportsMissingPath(new Error('thrown by something else'))).toBe(false);
    expect(reportsMissingPath('not an error at all')).toBe(false);
    expect(reportsMissingPath(undefined)).toBe(false);
  });
});
