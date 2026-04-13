import assert from 'node:assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { compileConfig } from '../../src/compile/compileConfig.ts';
import { isRecord } from '../../src/isRecord.ts';

const FIXTURE_PATH = path.resolve(import.meta.dirname, 'fixtures/pick-json-fixture.ts');

describe('pickJsonPlugin integration', () => {
  let outputDir: string;
  let outputPath: string;
  let compiledSource: string;

  beforeAll(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), 'pickjson-integration-'));
    outputPath = path.join(outputDir, 'pick-json-fixture.js');

    await compileConfig(FIXTURE_PATH, outputPath);
    compiledSource = await readFile(outputPath, 'utf8');
  });

  afterAll(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it('inlines the picked JSON values into the compiled output', () => {
    expect(compiledSource).toContain('"test-kit"');
    expect(compiledSource).toContain('"1.0.0"');
  });

  it('does not contain the pickJson runtime stub', () => {
    expect(compiledSource).not.toContain('pickJson');
  });

  it('produces valid ESM that exports the expected values', async () => {
    const mod: unknown = await import(outputPath);
    assert.ok(isRecord(mod));
    expect(mod.metadata).toStrictEqual({ name: 'test-kit', version: '1.0.0' });
  });
});
