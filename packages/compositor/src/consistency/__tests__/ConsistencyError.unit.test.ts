import { describe, expect, it } from 'vitest';

import { ConsistencyError } from '../ConsistencyError.ts';

describe(ConsistencyError, () => {
  it('composes the message from the subject and one line per violation', () => {
    const error = new ConsistencyError('Widget', [
      { path: 'parts[0].id', message: 'is empty' },
      { path: 'parts', message: 'lists "bolt" more than once' },
    ]);

    expect(error.message).toBe('Widget is inconsistent:\n  parts[0].id is empty\n  parts lists "bolt" more than once');
  });

  it('carries the violations it was raised with', () => {
    const violations = [{ path: 'parts', message: 'is empty' }];

    expect(new ConsistencyError('Widget', violations).violations).toStrictEqual(violations);
  });

  it('names itself, so a subclass that sets no name is still not reported as a bare Error', () => {
    expect(new ConsistencyError('Widget', []).name).toBe('ConsistencyError');
  });
});
