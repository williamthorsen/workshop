import assert from 'node:assert';
import path from 'node:path';
import process from 'node:process';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { InlinedJsonFile } from '../buildBundle.ts';
import { warnOnInlinedJson } from '../warnOnInlinedJson.ts';

describe(warnOnInlinedJson, () => {
  it('reports a bundled JSON file under its code, naming the kit and the file and suggesting pickJson', () => {
    using _io = captureStdio();

    const [warning] = warnOnInlinedJson('deploy', [inlinedJson('package.json', ['kits/deploy.ts'])]);

    expect(warning).toHaveProperty('code', 'json-inlined');
    expect(warning?.message).toContain('kit "deploy" bundles all of package.json');
    expect(warning?.message).toContain('any edit to the file leaves the kit stale');
    expect(warning?.remedy).toContain('pickJson');
  });

  it('names every module that imports the file, relative to the working directory', () => {
    using _io = captureStdio();

    const [warning] = warnOnInlinedJson('deploy', [inlinedJson('shared.json', ['kits/deploy.ts', 'kits/helper.ts'])]);

    expect(warning?.message).toContain('imported by kits/deploy.ts, kits/helper.ts,');
  });

  it('raises one warning per file', () => {
    using _io = captureStdio();

    const warnings = warnOnInlinedJson('deploy', [
      inlinedJson('package.json', ['kits/deploy.ts']),
      inlinedJson('settings.json', ['kits/deploy.ts']),
    ]);

    expect(warnings.map((warning) => warning.message)).toStrictEqual([
      expect.stringContaining('package.json'),
      expect.stringContaining('settings.json'),
    ]);
  });

  it('writes each warning to stderr with its remedy', () => {
    using io = captureStdio();

    const [warning] = warnOnInlinedJson('deploy', [inlinedJson('package.json', ['kits/deploy.ts'])]);

    assert.ok(warning);
    expect(io.stderr).toBe(`Warning: ${warning.message} ${warning.remedy}\n`);
  });

  it('reports nothing and writes nothing for a bundle that includes no JSON file', () => {
    using io = captureStdio();

    expect(warnOnInlinedJson('deploy', [])).toStrictEqual([]);
    expect(io.stderr).toBe('');
  });
});

// region | Helpers

/** Builds a bundled JSON file record from paths given relative to the working directory. */
function inlinedJson(filePath: string, importers: string[]): InlinedJsonFile {
  return {
    importers: importers.map((importer) => path.resolve(process.cwd(), importer)),
    path: path.resolve(process.cwd(), filePath),
  };
}

// endregion | Helpers
