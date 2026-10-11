import { describe, expect, it } from 'vitest';

import { renderIssueList } from '../renderIssueList.ts';

describe(renderIssueList, () => {
  it('aligns the status and summary columns on the widest key and status', () => {
    expect(
      renderIssueList([
        { key: 'PROJ-10', status: 'To Do', summary: 'Add a listing' },
        { key: 'PROJ-9', status: 'In Progress', summary: 'Fix the parser' },
      ]),
    ).toBe(['PROJ-10  To Do        Add a listing', 'PROJ-9   In Progress  Fix the parser'].join('\n'));
  });

  it('keeps a summary that spans several lines on one line', () => {
    expect(renderIssueList([{ key: 'PROJ-1', status: 'Done', summary: 'First line\r\n  second line\n' }])).toBe(
      'PROJ-1  Done  First line second line',
    );
  });

  it('leaves no trailing space after an empty summary', () => {
    expect(renderIssueList([{ key: 'PROJ-1', status: 'Done', summary: '' }])).toBe('PROJ-1  Done');
  });

  it('renders an empty listing as an empty string', () => {
    expect(renderIssueList([])).toBe('');
  });
});
