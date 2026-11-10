import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { RdyError } from '../../errors/RdyError.ts';
import { InvalidFromValueError } from '../InvalidFromValueError.ts';
import { parseFromArgument } from '../parseFromArgument.ts';

describe(parseFromArgument, () => {
  it('returns the parsed source for a valid value', () => {
    expect(parseFromArgument('github:acme/toolkit')).toStrictEqual({
      type: 'github',
      org: 'acme',
      repo: 'toolkit',
      ref: 'main',
    });
  });

  it('reports a rejected value as a usage error with the rejection as its cause', async () => {
    const error = await captureError(RdyError, () => parseFromArgument('https://example.com/kit.js'));

    expect(error.code).toBe('usage');
    expect(error.message).toBe('URLs are not accepted by --from. Use --url instead: https://example.com/kit.js');
    expect(error.cause).toBeInstanceOf(InvalidFromValueError);
  });

  it('propagates a failure other than a rejection unchanged', async () => {
    const defect = new TypeError('parser defect');

    const error = await captureError(() =>
      parseFromArgument('github:acme/toolkit', () => {
        throw defect;
      }),
    );

    expect(error).toBe(defect);
  });
});
