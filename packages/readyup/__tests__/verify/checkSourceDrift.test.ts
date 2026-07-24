import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkSourceDrift } from '../../src/verify/checkSourceDrift.ts';
import { hashBytes } from '../../src/verify/targetHash.ts';

describe(checkSourceDrift, () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'source-drift-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns ok when the on-disk hash matches the manifest sourceHash', () => {
    const content = Buffer.from('export default { checklists: [] };');
    writeFileSync(path.join(tempDir, 'demo.ts'), content);

    const status = checkSourceDrift({ name: 'demo', source: 'demo.ts', sourceHash: hashBytes(content) }, tempDir);

    expect(status.kind).toBe('ok');
  });

  it('returns stale with both hashes when the source has changed since compile', () => {
    writeFileSync(path.join(tempDir, 'demo.ts'), 'export default { checklists: [1] };');

    const status = checkSourceDrift({ name: 'demo', source: 'demo.ts', sourceHash: 'deadbeef' }, tempDir);

    expect(status).toMatchObject({
      kind: 'stale',
      expected: 'deadbeef',
      actual: hashBytes(Buffer.from('export default { checklists: [1] };')),
    });
  });

  it('returns missing when the recorded source file is gone', () => {
    const status = checkSourceDrift({ name: 'demo', source: 'demo.ts', sourceHash: 'deadbeef' }, tempDir);

    expect(status.kind).toBe('missing');
  });

  it('returns unverified when the kit has no sourceHash', () => {
    writeFileSync(path.join(tempDir, 'demo.ts'), 'content');

    const status = checkSourceDrift({ name: 'demo', source: 'demo.ts' }, tempDir);

    expect(status.kind).toBe('unverified');
  });

  it('returns unverified when the kit has no source', () => {
    const status = checkSourceDrift({ name: 'demo', sourceHash: 'deadbeef' }, tempDir);

    expect(status.kind).toBe('unverified');
  });

  it('resolves the source path relative to the manifest directory', () => {
    const content = Buffer.from('nested source');
    mkdirSync(path.join(tempDir, 'kits'), { recursive: true });
    writeFileSync(path.join(tempDir, 'kits', 'demo.ts'), content);

    const status = checkSourceDrift({ name: 'demo', source: 'kits/demo.ts', sourceHash: hashBytes(content) }, tempDir);

    expect(status.kind).toBe('ok');
  });
});
