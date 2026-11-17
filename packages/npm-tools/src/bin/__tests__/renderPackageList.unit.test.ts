import { describe, expect, it } from 'vitest';

import type { WorkspacePackage } from '../../workspace/listWorkspacePackages.ts';
import { renderListPackages, renderPackageJson, renderPackageTable } from '../renderPackageList.ts';

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

describe(renderListPackages, () => {
  const options = { cwd: '/work/repo', json: false };

  it('renders the packages on stdout with exit 0', () => {
    const output = renderListPackages({ kind: 'packages', packages: [ALPHA], root: '/work/repo' }, options);

    expect(output).toStrictEqual({ exitCode: 0, stderr: '', stdout: renderPackageTable([ALPHA]) });
  });

  it('renders JSON under json, and cuts table lines to maxWidth otherwise', () => {
    const listing = { kind: 'packages', packages: [ALPHA, BETA], root: '/work/repo' } as const;

    expect(renderListPackages(listing, { ...options, json: true }).stdout).toBe(renderPackageJson([ALPHA, BETA]));
    expect(renderListPackages(listing, { ...options, maxWidth: 40 }).stdout).toBe(
      renderPackageTable([ALPHA, BETA], { maxWidth: 40 }),
    );
  });

  it('reports a directory outside any workspace with exit 1', () => {
    expect(renderListPackages({ kind: 'not-a-workspace' }, options)).toStrictEqual({
      exitCode: 1,
      stderr:
        'thor-npm list-packages: no pnpm-workspace.yaml found in /work/repo or any parent directory; run it from inside a pnpm workspace\n',
      stdout: '',
    });
  });

  it('reports a package manifest that cannot be read with exit 1', () => {
    const listing = {
      kind: 'unreadable-package-manifest',
      manifestPath: '/work/repo/packages/alpha/package.json',
      reason: 'the manifest is not a JSON object',
      root: '/work/repo',
    } as const;

    expect(renderListPackages(listing, options)).toStrictEqual({
      exitCode: 1,
      stderr: 'thor-npm: could not read /work/repo/packages/alpha/package.json: the manifest is not a JSON object\n',
      stdout: '',
    });
  });

  it.each([
    ['all-excluded', "its exclusions remove every package that its patterns 'packages/*' match"],
    ['no-package', "its patterns 'packages/*' do not match any directory containing a package.json"],
    ['no-packages-list', 'pnpm-workspace.yaml does not declare a packages list'],
    ['no-pattern', "its packages list 'packages/*' does not contain a pattern that includes directories"],
  ] as const)('explains an empty workspace (%s) and renders an empty list with exit 0', (cause, reason) => {
    const listing = { cause, kind: 'empty', patterns: ['packages/*'], root: '/work/repo' } as const;

    expect(renderListPackages(listing, options)).toStrictEqual({
      exitCode: 0,
      stderr: `thor-npm list-packages: the workspace at /work/repo has no packages: ${reason}\n`,
      stdout: renderPackageTable([]),
    });
  });

  it.each([
    ['unreadable-manifest', '/work/repo/pnpm-workspace.yaml cannot be read or parsed as YAML'],
    ['unreadable-packages', 'the packages value in /work/repo/pnpm-workspace.yaml is not a list of strings'],
  ] as const)('reports a broken workspace manifest (%s) with exit 1 and no list', (cause, reason) => {
    const listing = { cause, kind: 'empty', patterns: [], root: '/work/repo' } as const;

    expect(renderListPackages(listing, options)).toStrictEqual({
      exitCode: 1,
      stderr: `thor-npm list-packages: ${reason}; fix it, then run this again\n`,
      stdout: '',
    });
  });
});

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
