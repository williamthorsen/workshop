import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { validateCompiledOutput } from '../../src/compile/validateCompiledOutput.ts';

/** Create a temporary ESM bundle that exports the given kit fields. */
function writeTempKit(dir: string, filename: string, kitFields: Record<string, unknown>): string {
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, filename);
  const serialized = JSON.stringify(kitFields);
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

    expect(metadata).toStrictEqual({ checklists: ['test'], description: 'A kit for testing' });
  });

  it('omits description key when the kit has none', async () => {
    const outputPath = writeTempKit(testDir, 'kit-no-desc.mjs', {
      checklists: [{ name: 'test', checks: [] }],
    });

    const metadata = await validateCompiledOutput(outputPath);

    expect(metadata).toStrictEqual({ checklists: ['test'], description: undefined });
  });

  it('records every checklist name in declaration order', async () => {
    const outputPath = writeTempKit(testDir, 'kit-multi-checklist.mjs', {
      checklists: [
        { name: 'preflight', checks: [] },
        { name: 'deploy', checks: [] },
      ],
    });

    const metadata = await validateCompiledOutput(outputPath);

    expect(metadata.checklists).toStrictEqual(['preflight', 'deploy']);
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
    expect(existsSync(outputPath)).toBe(false);
  });

  // A check is serialized to JSON here, so `check` arrives as a string rather than a function: the
  // same authoring mistake a hand-edited bundle would carry, and one compile must not let through.
  it('rejects a kit whose check is not a function, naming the offending location', async () => {
    const outputPath = writeTempKit(testDir, 'bad-check.mjs', {
      checklists: [{ name: 'test', checks: [{ name: 'a', check: 'nope' }] }],
    });

    await expect(validateCompiledOutput(outputPath)).rejects.toThrow(
      'checklists[0].checks[0].check: expected a function, got string',
    );
    expect(existsSync(outputPath)).toBe(false);
  });

  it('rejects a kit whose check declares an unknown severity', async () => {
    const outputPath = writeTempKit(testDir, 'bad-severity.mjs', {
      checklists: [{ name: 'test', checks: [{ name: 'a', check: 'nope', severity: 'info' }] }],
    });

    await expect(validateCompiledOutput(outputPath)).rejects.toThrow(
      'checklists[0].checks[0].severity: expected one of "error", "warn", "recommend", got "info"',
    );
  });

  it('names the compiled kit path in a validation failure', async () => {
    const outputPath = writeTempKit(testDir, 'unnamed-check.mjs', {
      checklists: [{ name: 'test', checks: [{ check: 'nope' }] }],
    });

    await expect(validateCompiledOutput(outputPath)).rejects.toThrow(`Invalid kit at ${outputPath}:`);
  });
});
