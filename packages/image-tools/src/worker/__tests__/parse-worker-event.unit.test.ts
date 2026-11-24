import { describe, expect, it } from 'vitest';

import { parseWorkerEvent } from '../parse-worker-event.ts';

describe(parseWorkerEvent, () => {
  it.each([
    { event: 'started', mfluxVersion: '0.24.0' },
    { event: 'rendered', height: 768, index: 2, steps: 8, width: 1024 },
    { event: 'failed', index: 0, message: 'out of memory' },
  ])('reads a $event event', (event) => {
    expect(parseWorkerEvent(JSON.stringify(event))).toStrictEqual(event);
  });

  it.each([
    ['text that is not JSON', 'Loading model…'],
    ['a value that is not an object', '[1]'],
    ['an unknown event', '{"event":"loaded"}'],
    ['a rendered event without steps', '{"event":"rendered","index":0,"width":1,"height":1}'],
    ['a negative index', '{"event":"failed","index":-1,"message":"x"}'],
  ])('rejects %s', (_label, line) => {
    expect(parseWorkerEvent(line)).toBeUndefined();
  });
});
