import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { validateCompiledOutput } from '../../src/compile/validateCompiledOutput.ts';

/** Create a temporary ESM bundle that exports the given kit fields. */
function writeTempKit(dir: string, filename: string, kitFields: Record<string, unknown>): string {
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, filename);
  const serialized = JSON.stringify(kitFields, (_key, value) => {
    // Functions can't be JSON-serialized; represent checks as plain objects.
    return value;
  });
  writeFileSync(filePath, `export default ${serialized};\n`);
  return filePath;
}

describe(validateCompiledOutput, () => {
  const testDir = join(tmpdir(), `readyup-test-validate-${Date.now()}`);

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns description when the kit has one', async () => {
    const outputPath = writeTempKit(testDir, 'kit-with-desc.mjs', {
      checklists: [{ name: 'test', checks: [] }],
      description: 'A kit for testing',
    });

    const metadata = await validateCompiledOutput(outputPath);

    expect(metadata).toStrictEqual({ description: 'A kit for testing' });
  });

  it('omits description key when the kit has none', async () => {
    const outputPath = writeTempKit(testDir, 'kit-no-desc.mjs', {
      checklists: [{ name: 'test', checks: [] }],
    });

    const metadata = await validateCompiledOutput(outputPath);

    expect(metadata).toStrictEqual({});
    expect('description' in metadata).toBe(false);
  });

  it('deletes the output file and throws when the bundle fails to load', async () => {
    const filePath = join(testDir, 'bad-bundle.mjs');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(filePath, 'throw new Error("parse error");\n');

    await expect(validateCompiledOutput(filePath)).rejects.toThrow('Failed to load compiled output for validation');
  });

  it('deletes the output file and throws when the kit is structurally invalid', async () => {
    const outputPath = writeTempKit(testDir, 'bad-kit.mjs', {
      notAKit: true,
    });

    await expect(validateCompiledOutput(outputPath)).rejects.toThrow();
  });
});
