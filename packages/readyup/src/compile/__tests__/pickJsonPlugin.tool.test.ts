import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { isRecord } from '../../portable/isRecord.ts';
import { compileConfig } from '../compileConfig.ts';

const FIXTURE_PATH = path.resolve(import.meta.dirname, 'fixtures/pick-json-fixture.ts');

const it = baseIt
  .extend(
    'temp',
    { scope: 'file' },
    makeFixture(() => createTempTree({}, { prefix: 'pickjson-compile-' })),
  )
  .extend('built', { scope: 'file' }, async ({ temp }): Promise<BuiltFixture> => {
    const outputPath = temp.resolve('pick-json-fixture.js');

    await compileConfig(FIXTURE_PATH, outputPath);

    return { compiledSource: await readFile(outputPath, 'utf8'), outputPath };
  });

/** The compiled fixture that the suite's one compile produced. */
interface BuiltFixture {
  compiledSource: string;
  outputPath: string;
}

describe('pickJsonPlugin compile pipeline', () => {
  it('inlines the picked JSON values into the compiled output', ({ built }) => {
    expect(built.compiledSource).toContain('"test-kit"');
    expect(built.compiledSource).toContain('"1.0.0"');
  });

  it('does not contain the pickJson runtime stub', ({ built }) => {
    expect(built.compiledSource).not.toContain('pickJson');
  });

  it('produces valid ESM that exports the expected values', async ({ built }) => {
    const mod: unknown = await import(built.outputPath);
    assert.ok(isRecord(mod));
    expect(mod['metadata']).toStrictEqual({ name: 'test-kit', version: '1.0.0' });
  });
});
