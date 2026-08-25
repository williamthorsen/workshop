import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { BlobSchema, FileEntrySchema, FileOwnershipSchema } from '../file-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const contributors = { artifacts: [{ artifactId: 'rulebook:style' }], partials: [] };
const file = {
  targetId: 'claude',
  path: 'skills/review/SKILL.md',
  status: 'changed',
  ownership: { kind: 'full' },
  current: { hash: 'h1' },
  planned: { hash: 'h2' },
  contributors,
};

describe('FileOwnershipSchema', () => {
  it('accepts a file the engine writes whole', () => {
    expect(FileOwnershipSchema.parse({ kind: 'full' })).toStrictEqual({ kind: 'full' });
  });

  it('accepts a fenced region located by its marker pair', () => {
    const region = { kind: 'region', open: '<!-- open -->', close: '<!-- close -->' };

    expect(FileOwnershipSchema.parse(region)).toStrictEqual(region);
  });

  it('accepts entry-level ownership within a structured document', () => {
    const entries = {
      kind: 'entries',
      format: 'yaml',
      collections: [{ path: ['eventHooks', 'events'], sentinel: { path: ['source'], value: 'codeassembly' } }],
    };

    expect(FileOwnershipSchema.parse(entries)).toStrictEqual(entries);
  });

  it('accepts entry ownership over several collections of one host, which one file may hold', () => {
    const entries = {
      kind: 'entries',
      format: 'json',
      collections: [
        { path: ['hooks', 'SessionStart'], sentinel: { path: ['source'], value: 'codeassembly' } },
        { path: ['hooks', 'Stop'], sentinel: { path: ['source'], value: 'codeassembly' } },
      ],
    };

    expect(FileOwnershipSchema.parse(entries)).toStrictEqual(entries);
  });

  it('if entry ownership names no collection, rejects it: the engine owns items somewhere or nowhere', () => {
    const empty = { kind: 'entries', format: 'json', collections: [] };

    expect(findIssuePaths(FileOwnershipSchema, empty)).toStrictEqual([['collections']]);
  });

  it('if a region omits its markers, rejects it for those fields', () => {
    expect(findIssuePaths(FileOwnershipSchema, { kind: 'region' })).toStrictEqual([['open'], ['close']]);
  });

  it('if entry ownership names an unsupported document format, rejects it for that field', () => {
    const unsupported = {
      kind: 'entries',
      format: 'toml',
      collections: [{ path: ['hooks'], sentinel: { path: ['source'], value: 'codeassembly' } }],
    };

    expect(findIssuePaths(FileOwnershipSchema, unsupported)).toStrictEqual([['format']]);
  });

  it('if the ownership kind is outside the known set, rejects it', () => {
    expect(findIssuePaths(FileOwnershipSchema, { kind: 'partial' })).toStrictEqual([['kind']]);
  });
});

describe('BlobSchema', () => {
  it('carries bytes that do not survive a UTF-8 round trip', () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const parsed = BlobSchema.parse({ encoding: 'base64', data: bytes.toString('base64') });

    expect(Buffer.from(parsed.data, 'base64')).toStrictEqual(bytes);
  });

  it('if the encoding is outside the known set, rejects the blob for that field', () => {
    expect(findIssuePaths(BlobSchema, { encoding: 'hex', data: 'ff' })).toStrictEqual([['encoding']]);
  });
});

describe('FileEntrySchema', () => {
  it('accepts a file whose two sides carry differing hashes', () => {
    expect(FileEntrySchema.parse(file)).toStrictEqual(file);
  });

  it('omits the current side for a file that does not yet exist', () => {
    const { current: _absent, ...added } = { ...file, status: 'added' };

    expect(FileEntrySchema.parse(added)).toStrictEqual(added);
  });

  it('omits the planned side for a file that will be removed', () => {
    const { planned: _absent, ...removed } = { ...file, status: 'removed' };

    expect(FileEntrySchema.parse(removed)).toStrictEqual(removed);
  });

  it('accepts a file apply will skip, keeping the diff beside the reason', () => {
    const blocked = { ...file, blocked: { reason: 'the region host is malformed' } };

    expect(FileEntrySchema.parse(blocked)).toStrictEqual(blocked);
  });

  it('accepts a file the engine generates from no source content', () => {
    const generated = { ...file, contributors: { artifacts: [], partials: [] } };

    expect(FileEntrySchema.parse(generated)).toStrictEqual(generated);
  });

  it('locates each contributing artifact within an aggregated region', () => {
    const aggregated = {
      ...file,
      ownership: { kind: 'region', open: '<!-- open -->', close: '<!-- close -->' },
      contributors: {
        artifacts: [
          { artifactId: 'rulebook:style', marker: { open: '<!-- style -->', close: '<!-- /style -->' } },
          { artifactId: 'rulebook:tests', marker: { open: '<!-- tests -->', close: '<!-- /tests -->' } },
        ],
        partials: ['team:_data/shared.md'],
      },
    };

    expect(FileEntrySchema.parse(aggregated)).toStrictEqual(aggregated);
  });

  it('if contributors are absent, rejects the file for that field', () => {
    const { contributors: _dropped, ...withoutContributors } = file;

    expect(findIssuePaths(FileEntrySchema, withoutContributors)).toStrictEqual([['contributors']]);
  });
});
