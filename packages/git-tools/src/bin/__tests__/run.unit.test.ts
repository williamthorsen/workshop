import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { HELP, run } from '../run.ts';

describe(run, () => {
  it.each([[[]], [['--help']], [['-h']]])('writes help to stdout and returns 0 for %j', (argv) => {
    using io = captureStdio();

    const code = run(argv);

    expect(io.stdout).toBe(HELP);
    expect(io.stderr).toBe('');
    expect(code).toBe(0);
  });

  it('reports an unrecognized argument to stderr and returns 2', () => {
    using io = captureStdio();

    const code = run(['list']);

    expect(io.stdout).toBe('');
    expect(io.stderr).toBe('thor-git: not implemented yet: list\n');
    expect(code).toBe(2);
  });

  it('returns 2 when --help is combined with another argument', () => {
    using io = captureStdio();

    const code = run(['--help', 'list']);

    expect(io.stdout).toBe('');
    expect(code).toBe(2);
  });
});
