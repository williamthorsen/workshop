import { describe, expect, it } from 'vitest';

import { parseFromValue } from '../src/parseFromValue.ts';

describe(parseFromValue, () => {
  // -- github scheme --

  it('parses github: with org/repo defaulting ref to main', () => {
    expect(parseFromValue('github:acme/toolkit')).toStrictEqual({
      type: 'github',
      org: 'acme',
      repo: 'toolkit',
      ref: 'main',
    });
  });

  it('parses github: with explicit ref', () => {
    expect(parseFromValue('github:acme/toolkit@v2')).toStrictEqual({
      type: 'github',
      org: 'acme',
      repo: 'toolkit',
      ref: 'v2',
    });
  });

  it('throws for github: with empty ref', () => {
    expect(() => parseFromValue('github:acme/toolkit@')).toThrow("ref after '@' must not be empty");
  });

  it('throws for github: without slash-separated org/repo', () => {
    expect(() => parseFromValue('github:toolkit')).toThrow('expected "owner/repo" format');
  });

  // -- bitbucket scheme --

  it('parses bitbucket: with workspace/repo defaulting ref to main', () => {
    expect(parseFromValue('bitbucket:myteam/deploy-checks')).toStrictEqual({
      type: 'bitbucket',
      workspace: 'myteam',
      repo: 'deploy-checks',
      ref: 'main',
    });
  });

  it('parses bitbucket: with explicit ref', () => {
    expect(parseFromValue('bitbucket:myteam/deploy-checks@release/1.0')).toStrictEqual({
      type: 'bitbucket',
      workspace: 'myteam',
      repo: 'deploy-checks',
      ref: 'release/1.0',
    });
  });

  it('throws for bitbucket: with missing repo', () => {
    expect(() => parseFromValue('bitbucket:myteam')).toThrow('expected "owner/repo" format');
  });

  // -- URL rejection --

  it('throws for https:// values with helpful message', () => {
    expect(() => parseFromValue('https://example.com/kit.js')).toThrow('Use --url instead');
  });

  it('throws for http:// values with helpful message', () => {
    expect(() => parseFromValue('http://example.com/kit.js')).toThrow('Use --url instead');
  });

  // -- global keyword --

  it('parses "global" keyword', () => {
    expect(parseFromValue('global')).toStrictEqual({ type: 'global' });
  });

  // -- dir: scheme --

  it('parses dir: with absolute path', () => {
    expect(parseFromValue('dir:/opt/kits')).toStrictEqual({ type: 'directory', path: '/opt/kits' });
  });

  it('parses dir: with relative path', () => {
    expect(parseFromValue('dir:../shared/kits')).toStrictEqual({ type: 'directory', path: '../shared/kits' });
  });

  // -- local path fallback --

  it('treats absolute path as local source', () => {
    expect(parseFromValue('/path/to/repo')).toStrictEqual({ type: 'local', path: '/path/to/repo' });
  });

  it('treats relative path as local source', () => {
    expect(parseFromValue('../sibling-repo')).toStrictEqual({ type: 'local', path: '../sibling-repo' });
  });

  it('treats tilde-prefixed path as local source', () => {
    expect(parseFromValue('~/projects/other')).toStrictEqual({ type: 'local', path: '~/projects/other' });
  });

  it('treats bare name as local source', () => {
    expect(parseFromValue('.')).toStrictEqual({ type: 'local', path: '.' });
  });
});
