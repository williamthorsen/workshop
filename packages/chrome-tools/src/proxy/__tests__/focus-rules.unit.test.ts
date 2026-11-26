import { describe, expect, it } from 'vitest';

import { applyFocusRules } from '../focus-rules.ts';

describe(applyFocusRules, () => {
  it('forwards Target.createTarget as a background create', () => {
    const verdict = applyFocusRules(JSON.stringify({ id: 3, method: 'Target.createTarget', params: { url: 'a:b' } }));
    expect(verdict.kind).toBe('forward');
    expect(JSON.parse(verdict.data)).toStrictEqual({
      id: 3,
      method: 'Target.createTarget',
      params: { background: true, url: 'a:b' },
    });
  });

  it('overrides an explicit background: false and keeps the other params and the sessionId', () => {
    const message = {
      id: 4,
      method: 'Target.createTarget',
      params: { background: false, newWindow: true, url: 'about:blank' },
      sessionId: 'S1',
    };
    const verdict = applyFocusRules(JSON.stringify(message));
    expect(verdict.kind).toBe('forward');
    expect(JSON.parse(verdict.data)).toStrictEqual({
      ...message,
      params: { background: true, newWindow: true, url: 'about:blank' },
    });
  });

  it('adds params to a Target.createTarget that has none', () => {
    const verdict = applyFocusRules(JSON.stringify({ id: 5, method: 'Target.createTarget' }));
    expect(JSON.parse(verdict.data)).toStrictEqual({
      id: 5,
      method: 'Target.createTarget',
      params: { background: true },
    });
  });

  it.each(['Target.activateTarget', 'Page.bringToFront'])('answers %s with an empty success', (method) => {
    const verdict = applyFocusRules(JSON.stringify({ id: 7, method, params: { targetId: 'T' } }));
    expect(verdict).toStrictEqual({ data: JSON.stringify({ id: 7, result: {} }), kind: 'reply' });
  });

  it('echoes the sessionId of a suppressed request in its reply', () => {
    const verdict = applyFocusRules(JSON.stringify({ id: 8, method: 'Page.bringToFront', sessionId: 'S2' }));
    expect(verdict).toStrictEqual({ data: JSON.stringify({ id: 8, result: {}, sessionId: 'S2' }), kind: 'reply' });
  });

  it('forwards every other method with its original text', () => {
    const data = '{ "id": 9,  "method": "Browser.getVersion" }';
    expect(applyFocusRules(data)).toStrictEqual({ data, kind: 'forward' });
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['a JSON array', '[1,2]'],
    ['an object without a method', '{"id":1}'],
    ['a method that is not a string', '{"id":1,"method":5}'],
  ])('forwards %s unchanged', (_label, data) => {
    expect(applyFocusRules(data)).toStrictEqual({ data, kind: 'forward' });
  });
});
