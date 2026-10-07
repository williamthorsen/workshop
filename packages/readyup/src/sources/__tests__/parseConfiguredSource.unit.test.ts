import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { RdyError } from '../../errors/RdyError.ts';
import { parseConfiguredSource } from '../parseConfiguredSource.ts';

describe(parseConfiguredSource, () => {
  it.each([
    ['npm:readyup', { type: 'npm', name: 'readyup', versionSpec: undefined }],
    ['npm:@williamthorsen/nmr', { type: 'npm', name: '@williamthorsen/nmr', versionSpec: undefined }],
    ['github:acme/standards', { type: 'github', org: 'acme', repo: 'standards', ref: 'main' }],
    ['github:acme/.github@v2', { type: 'github', org: 'acme', repo: '.github', ref: 'v2' }],
    ['bitbucket:acme/standards', { type: 'bitbucket', workspace: 'acme', repo: 'standards', ref: 'main' }],
    ['bitbucket:acme/standards@v2', { type: 'bitbucket', workspace: 'acme', repo: 'standards', ref: 'v2' }],
  ])('parses %s, keeping its spelling', (entry, source) => {
    expect(parseConfiguredSource(entry)).toStrictEqual({ spelling: entry, source });
  });

  it.each([
    ['readyup', 'npm:readyup'],
    ['@williamthorsen/nmr', 'npm:@williamthorsen/nmr'],
  ])('rejects the scheme-less %s, suggesting %s', async (entry, suggestion) => {
    const error = await captureError(RdyError, () => parseConfiguredSource(entry));

    expect(error.code).toBe('config');
    expect(error.message).toContain(`"${suggestion}"`);
  });

  it.each([
    'dir:kits',
    'global:x',
    'https://example.com/kit.js',
    'github:acme',
    'github:acme/standards@',
    'npm:readyup@1',
  ])('rejects %s with a config error naming the entry', async (entry) => {
    const error = await captureError(RdyError, () => parseConfiguredSource(entry));

    expect(error.code).toBe('config');
    expect(error.message).toContain(`"${entry}"`);
  });
});
