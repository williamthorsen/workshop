import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import type { InlinedJsonFile } from '../buildBundle.ts';
import { listInlinedJsonWarnings } from '../listInlinedJsonWarnings.ts';

describe(listInlinedJsonWarnings, () => {
  it('reports a bundled JSON file under its code, naming the kit and the file and suggesting pickJson', () => {
    const [warning] = listInlinedJsonWarnings('deploy', [inlinedJson('package.json', ['kits/deploy.ts'])]);

    expect(warning).toHaveProperty('code', 'json-inlined');
    expect(warning?.message).toContain('kit "deploy" bundles all of package.json');
    expect(warning?.message).toContain('any edit to the file leaves the kit stale');
    expect(warning?.remedy).toContain('pickJson');
  });

  it('names every module that imports the file, relative to the working directory', () => {
    const [warning] = listInlinedJsonWarnings('deploy', [
      inlinedJson('shared.json', ['kits/deploy.ts', 'kits/helper.ts']),
    ]);

    expect(warning?.message).toContain('imported by kits/deploy.ts, kits/helper.ts,');
  });

  it('names a file and an importer outside the working directory by their absolute paths', () => {
    const [warning] = listInlinedJsonWarnings('deploy', [inlinedJson('../shared.json', ['../kits/deploy.ts'])]);

    expect(warning?.message).toContain(
      `bundles all of ${path.resolve(process.cwd(), '../shared.json')}, imported by ${path.resolve(process.cwd(), '../kits/deploy.ts')},`,
    );
  });

  it('raises one warning per file', () => {
    const warnings = listInlinedJsonWarnings('deploy', [
      inlinedJson('package.json', ['kits/deploy.ts']),
      inlinedJson('settings.json', ['kits/deploy.ts']),
    ]);

    expect(warnings.map((warning) => warning.message)).toStrictEqual([
      expect.stringContaining('package.json'),
      expect.stringContaining('settings.json'),
    ]);
  });

  it('reports nothing for a bundle that includes no JSON file', () => {
    expect(listInlinedJsonWarnings('deploy', [])).toStrictEqual([]);
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
