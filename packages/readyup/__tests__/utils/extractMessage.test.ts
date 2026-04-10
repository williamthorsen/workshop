import { describe, expect, it } from 'vitest';

import { extractMessage } from '../../src/utils/error-handling.ts';

describe('extractMessage', () => {
  it('returns the message from an Error instance', () => {
    expect(extractMessage(new Error('something broke'))).toBe('something broke');
  });

  it('returns the message from an Error subclass', () => {
    expect(extractMessage(new TypeError('bad type'))).toBe('bad type');
  });

  it('stringifies a plain string', () => {
    expect(extractMessage('raw string')).toBe('raw string');
  });

  it('stringifies a number', () => {
    expect(extractMessage(42)).toBe('42');
  });

  it('stringifies null', () => {
    expect(extractMessage(null)).toBe('null');
  });

  it('stringifies undefined', () => {
    expect(extractMessage(undefined)).toBe('undefined');
  });

  it('stringifies an object', () => {
    expect(extractMessage({ code: 'ENOENT' })).toBe('[object Object]');
  });
});
