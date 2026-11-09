import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { internalError } from '../../errors/RdyError.ts';
import { reportEscapedFailure, reportFailure } from '../route.ts';

const FRAME_PATTERN = /^\s+at /m;

const ESCAPE_HINT = 'A check that starts async work must await it or return it.';

describe(reportFailure, () => {
  it('reports an unrecognized error as an internal error followed by its stack frames, and exits 2', () => {
    using io = captureStdio();

    const exitCode = reportFailure(new Error('boom'), false);

    expect(exitCode).toBe(2);
    expect(io.stderr).toMatch(/^rdy: internal error: boom\n\s+at /);
    expect(io.stdout).toBe('');
  });

  it('reports a thrown non-error value by its string form, without stack frames', () => {
    using io = captureStdio();

    reportFailure('boom', false);

    expect(io.stderr).toBe('rdy: internal error: boom\n');
  });

  it('reports an internal RdyError in the handled shape', () => {
    using io = captureStdio();

    reportFailure(internalError('Could not read the docs.'), false);

    expect(io.stderr).toBe('rdy: Could not read the docs.\n');
  });

  it('reports a foreign error that carries a hint in the handled shape', () => {
    using io = captureStdio();

    reportFailure(Object.assign(new Error('missing dependency'), { hint: 'Install it.' }), false);

    expect(io.stderr).toMatch(/^rdy: missing dependency\n/);
    expect(io.stderr).toContain('Install it.');
    expect(io.stderr).not.toContain('internal error');
    expect(io.stderr).not.toMatch(FRAME_PATTERN);
  });

  it('reports a crash under --json as the unchanged error envelope', () => {
    using io = captureStdio();

    const exitCode = reportFailure(new Error('boom'), true);

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stdout)).toStrictEqual({ schemaVersion: 1, error: { code: 'internal', message: 'boom' } });
    expect(io.stderr).toBe('');
  });
});

describe(reportEscapedFailure, () => {
  it('reports the message, then the escaped error stack frames, then the hint, and exits 2', () => {
    using io = captureStdio();

    const exitCode = reportEscapedFailure(new Error('leaked'), false);

    expect(exitCode).toBe(2);
    const lines = io.stderr.trimEnd().split('\n');
    expect(lines[0]).toBe('rdy: internal error: Nothing awaited this failure: leaked');
    expect(lines[1]).toMatch(FRAME_PATTERN);
    expect(lines.at(-1)).toContain(ESCAPE_HINT);
  });

  it('reports an escaped failure under --json as the unchanged error envelope', () => {
    using io = captureStdio();

    reportEscapedFailure(new Error('leaked'), true);

    expect(JSON.parse(io.stdout)).toStrictEqual({
      schemaVersion: 1,
      error: { code: 'internal', message: 'Nothing awaited this failure: leaked', hint: ESCAPE_HINT },
    });
    expect(io.stderr).toBe('');
  });
});
