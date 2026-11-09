import { describe, expect, it } from 'vitest';

import type { WorkspacePackage } from '../../workspace/listWorkspacePackages.ts';
import { renderPackageJson, renderPackageTable } from '../renderPackageList.ts';

const ALPHA: WorkspacePackage = {
  description: 'Does the alpha things',
  directory: 'packages/alpha',
  name: '@scope/alpha',
  private: false,
  version: '1.0.0',
};

const BETA: WorkspacePackage = {
  description: null,
  directory: 'packages/beta-long',
  name: 'beta',
  private: true,
  version: null,
};

describe(renderPackageTable, () => {
  it('pads each column to its widest value and maps private to the PUBLISH column', () => {
    expect(renderPackageTable([ALPHA, BETA])).toBe(
      [
        'PUBLISH  NAME          VERSION  DIRECTORY  DESCRIPTION',
        'yes      @scope/alpha  1.0.0    alpha      Does the alpha things',
        'no       beta                   beta-long',
        '',
      ].join('\n'),
    );
  });

  it('keeps the full directory when the packages do not share a parent directory', () => {
    const tool: WorkspacePackage = { ...BETA, directory: 'tools/cli' };

    const lines = renderPackageTable([ALPHA, tool]).split('\n');

    expect(lines[1]).toContain('  packages/alpha  ');
    expect(lines[2]).toMatch(/ {2}tools\/cli\s*$/);
  });

  it('cuts each line to maxWidth, marking the cut', () => {
    const lines = renderPackageTable([ALPHA, BETA], { maxWidth: 40 }).trimEnd().split('\n');

    expect(lines.map((line) => line.length)).toStrictEqual([40, 40, 40]);
    expect(lines[1]).toBe('yes      @scope/alpha  1.0.0    alpha  …');
  });

  it('leaves lines whole when maxWidth is not set', () => {
    const long: WorkspacePackage = { ...ALPHA, description: 'x'.repeat(300) };

    expect(renderPackageTable([long])).toContain('x'.repeat(300));
  });

  it('keeps a multi-line description on one line', () => {
    const multiline: WorkspacePackage = { ...ALPHA, description: 'First line\nsecond line' };

    expect(renderPackageTable([multiline])).toContain('First line second line\n');
  });

  it('renders only the header when there are no packages', () => {
    expect(renderPackageTable([])).toBe('PUBLISH  NAME  VERSION  DIRECTORY  DESCRIPTION\n');
  });
});

describe(renderPackageJson, () => {
  it('renders every field under a packages key, with the full directory and null for a missing field', () => {
    expect(JSON.parse(renderPackageJson([ALPHA, BETA]))).toStrictEqual({
      packages: [
        {
          name: '@scope/alpha',
          version: '1.0.0',
          private: false,
          directory: 'packages/alpha',
          description: 'Does the alpha things',
        },
        { name: 'beta', version: null, private: true, directory: 'packages/beta-long', description: null },
      ],
    });
  });

  it('renders an empty list when there are no packages', () => {
    expect(renderPackageJson([])).toBe('{\n  "packages": []\n}\n');
  });
});
