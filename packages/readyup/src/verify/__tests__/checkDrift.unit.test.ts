import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkDrift } from '../checkDrift.ts';
import { computeHash } from '../../check-utils/hashing.ts';
import { hashBytes } from '../targetHash.ts';

describe(checkDrift, () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'drift-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns ok when the on-disk hash matches the manifest targetHash', () => {
    const content = Buffer.from('compiled output');
    writeFileSync(path.join(tempDir, 'demo.js'), content);
    const expectedHash = hashBytes(content);

    const status = checkDrift({ name: 'demo', path: 'demo.js', targetHash: expectedHash }, tempDir);

    expect(status.kind).toBe('ok');
  });

  it.each([12, 64])('returns ok when the manifest records a %i-character targetHash', (length) => {
    const content = Buffer.from('compiled output');
    writeFileSync(path.join(tempDir, 'demo.js'), content);
    const recorded = computeHash(content).slice(0, length);

    const status = checkDrift({ name: 'demo', path: 'demo.js', targetHash: recorded }, tempDir);

    expect(status).toStrictEqual({ kind: 'ok', targetHash: recorded });
  });

  it('reports the actual hash at the recorded length when a longer record has drifted', () => {
    writeFileSync(path.join(tempDir, 'demo.js'), 'on-disk content');
    const recorded = computeHash('other content').slice(0, 64);

    const status = checkDrift({ name: 'demo', path: 'demo.js', targetHash: recorded }, tempDir);

    expect(status).toMatchObject({ kind: 'drift', expected: recorded, actual: computeHash('on-disk content') });
  });

  it('returns drift when hashes differ', () => {
    writeFileSync(path.join(tempDir, 'demo.js'), 'on-disk content');

    const status = checkDrift({ name: 'demo', path: 'demo.js', targetHash: 'deadbeef' }, tempDir);

    expect(status).toMatchObject({
      kind: 'drift',
      expected: 'deadbeef',
      actual: hashBytes(Buffer.from('on-disk content')),
    });
  });

  it('returns missing when the compiled file does not exist', () => {
    const status = checkDrift({ name: 'demo', path: 'demo.js', targetHash: 'deadbeef' }, tempDir);

    expect(status.kind).toBe('missing');
  });

  it('returns unverified when the kit has no targetHash', () => {
    writeFileSync(path.join(tempDir, 'demo.js'), 'content');

    const status = checkDrift({ name: 'demo', path: 'demo.js' }, tempDir);

    expect(status.kind).toBe('unverified');
  });

  it('returns unverified when the kit has no path', () => {
    const status = checkDrift({ name: 'demo', targetHash: 'deadbeef' }, tempDir);

    expect(status.kind).toBe('unverified');
  });
});
