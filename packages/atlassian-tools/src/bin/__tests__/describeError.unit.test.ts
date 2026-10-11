import { describe, expect, it } from 'vitest';

import { describeError } from '../subcommand-support.ts';

describe(describeError, () => {
  it('reports the message of an error with no cause', () => {
    expect(describeError(new Error('the keychain is locked'))).toBe('the keychain is locked');
  });

  it('stringifies a thrown value that is not an error', () => {
    expect(describeError('a bare string')).toBe('a bare string');
  });

  it('names the reason a fetch failed, which the message alone does not', () => {
    const cause = new Error('getaddrinfo ENOTFOUND acme.atlassian.net');
    const error = new TypeError('fetch failed', { cause });

    expect(describeError(error)).toBe('fetch failed: getaddrinfo ENOTFOUND acme.atlassian.net');
  });

  it('walks a chain deeper than one cause', () => {
    const root = new Error('connect ECONNREFUSED 127.0.0.1:443');
    const middle = new Error('the proxy refused the tunnel', { cause: root });

    expect(describeError(new TypeError('fetch failed', { cause: middle }))).toBe(
      'fetch failed: the proxy refused the tunnel: connect ECONNREFUSED 127.0.0.1:443',
    );
  });

  it('skips a link with no message, which an AggregateError often is', () => {
    const root = new Error('certificate has expired');
    // eslint-disable-next-line unicorn/error-message -- an empty message is the shape under test.
    const empty = new AggregateError([root], '', { cause: root });

    expect(describeError(new TypeError('fetch failed', { cause: empty }))).toBe(
      'fetch failed: certificate has expired',
    );
  });

  it('does not repeat a message already quoted by a wrapper', () => {
    const cause = new SyntaxError('Unexpected end of JSON input');
    const error = new Error(`A spec is JSON: ${cause.message}`, { cause });

    expect(describeError(error)).toBe('A spec is JSON: Unexpected end of JSON input');
  });

  it('stops on a chain that points back at itself', () => {
    const outer = new Error('outer');
    const inner = new Error('inner', { cause: outer });
    // eslint-disable-next-line unicorn/no-error-property-assignment -- a cycle closes only after construction.
    outer.cause = inner;

    expect(describeError(outer)).toBe('outer: inner');
  });

  it('ignores a cause that is not an error, which has no message to append', () => {
    expect(describeError(new Error('fetch failed', { cause: 'ENOTFOUND' }))).toBe('fetch failed');
  });
});
