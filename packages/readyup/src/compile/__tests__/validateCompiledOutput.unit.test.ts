import assert from 'node:assert';
import { existsSync } from 'node:fs';

import { captureError, createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { validateCompiledOutput } from '../validateCompiledOutput.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'readyup-test-validate-' })),
);

describe(validateCompiledOutput, () => {
  it('returns description when the kit has one', async ({ temp }) => {
    const outputPath = writeTempKit(temp, 'kit-with-desc.mjs', {
      checklists: [{ name: 'test', checks: [] }],
      description: 'A kit for testing',
    });

    const metadata = await validateCompiledOutput(outputPath);

    expect(metadata).toStrictEqual({ checklists: ['test'], description: 'A kit for testing' });
  });

  it('omits description key when the kit has none', async ({ temp }) => {
    const outputPath = writeTempKit(temp, 'kit-no-desc.mjs', {
      checklists: [{ name: 'test', checks: [] }],
    });

    const metadata = await validateCompiledOutput(outputPath);

    expect(metadata).toStrictEqual({ checklists: ['test'], description: undefined });
  });

  it('records every checklist name in declaration order', async ({ temp }) => {
    const outputPath = writeTempKit(temp, 'kit-multi-checklist.mjs', {
      checklists: [
        { name: 'preflight', checks: [] },
        { name: 'deploy', checks: [] },
      ],
    });

    const metadata = await validateCompiledOutput(outputPath);

    expect(metadata.checklists).toStrictEqual(['preflight', 'deploy']);
  });

  it('deletes the output file and throws when the bundle fails to load', async ({ temp }) => {
    const filePath = temp.write('bad-bundle.mjs', 'throw new Error("parse error");\n');

    const error = await captureError(() => validateCompiledOutput(filePath));

    const { cause } = error;
    assert.ok(cause instanceof Error);
    expect(cause.message).toContain('parse error');
    expect(error.message).toBe(`Failed to load compiled output for validation: ${cause.message}`);
  });

  it('deletes the output file and throws when the kit is structurally invalid', async ({ temp }) => {
    const outputPath = writeTempKit(temp, 'bad-kit.mjs', {
      notAKit: true,
    });

    await expect(validateCompiledOutput(outputPath)).rejects.toThrow('Kit file must export checklists');
    expect(existsSync(outputPath)).toBe(false);
  });

  // A check is serialized to JSON here, so `check` is a string rather than a function: the
  // same authoring mistake that a hand-edited bundle would have, and one that compile must not let through.
  it('rejects a kit whose check is not a function, naming the offending location', async ({ temp }) => {
    const outputPath = writeTempKit(temp, 'bad-check.mjs', {
      checklists: [{ name: 'test', checks: [{ name: 'a', check: 'nope' }] }],
    });

    await expect(validateCompiledOutput(outputPath)).rejects.toThrow(
      'checklists[0].checks[0].check: expected a function, got string',
    );
    expect(existsSync(outputPath)).toBe(false);
  });

  it('rejects a kit whose check declares an unknown severity', async ({ temp }) => {
    const outputPath = writeTempKit(temp, 'bad-severity.mjs', {
      checklists: [{ name: 'test', checks: [{ name: 'a', check: 'nope', severity: 'info' }] }],
    });

    await expect(validateCompiledOutput(outputPath)).rejects.toThrow(
      'checklists[0].checks[0].severity: expected one of "error", "warn", "recommend", got "info"',
    );
  });

  it('names the compiled kit path in a validation failure', async ({ temp }) => {
    const outputPath = writeTempKit(temp, 'unnamed-check.mjs', {
      checklists: [{ name: 'test', checks: [{ check: 'nope' }] }],
    });

    await expect(validateCompiledOutput(outputPath)).rejects.toThrow(`Invalid kit at ${outputPath}:`);
  });

  // Written as source rather than through `writeTempKit`, because JSON expresses neither a getter
  // nor the `check` function that the kit needs to validate.
  it('accepts a kit whose fix accessor throws, leaving the compiled output in place', async ({ temp }) => {
    const filePath = temp.write(
      'throwing-fix.mjs',
      [
        'export default {',
        "  checklists: [{ name: 'test', checks: [{ name: 'a', check: () => true,",
        "    get fix() { throw new Error('resolved too early'); } }] }],",
        '};',
        '',
      ].join('\n'),
    );

    const metadata = await validateCompiledOutput(filePath);

    expect(metadata.checklists).toStrictEqual(['test']);
    expect(existsSync(filePath)).toBe(true);
  });
});

// region | Helpers

/** Returns the path to a temporary ESM bundle exporting the given kit fields. */
function writeTempKit(tree: TempTree, filename: string, kitFields: Record<string, unknown>): string {
  return tree.write(filename, `export default ${JSON.stringify(kitFields)};\n`);
}

// endregion | Helpers
