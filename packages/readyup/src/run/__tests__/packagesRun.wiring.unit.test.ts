import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportSchema } from '../../schemas/reportSchema.ts';
import { captureRdyError } from '../../test-utils/captureRdyError.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import { resolveKitSources } from '../resolveKitSources.ts';
import { runCommand } from '../runCommand.ts';

/**
 * Joins `--packages` to the kits an installed package publishes, against a real fixture project. The
 * unit tests cover the expansion and the resolver separately; this locks in the seam between them —
 * that a configured package becomes a run entry carrying the provenance the report and the headings
 * render, and that the kit name selects which of its kits run.
 */
describe('--packages run path wiring', () => {
  let projectRoot: string;
  let originalCwd: string;
  let stdout: string[];

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'packages-run-')));
    stdout = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    originalCwd = process.cwd();
    process.chdir(projectRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('expands a configured package into entries carrying its name and version', () => {
    installPackage('@acme/kits', ['default'], { version: '2.1.0' });

    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    expect(entries).toStrictEqual([
      {
        name: 'default',
        source: { path: path.join(projectRoot, 'node_modules', '@acme/kits', '.readyup', 'kits', 'default.js') },
        checklists: [],
        provenance: { kind: 'package', packageName: '@acme/kits', version: '2.1.0' },
      },
    ]);
  });

  // The defect #215 reports: a kit needing credentials failed a run that never asked for it.
  it('runs only the default kit when the invocation names none', () => {
    installPackage('@acme/kits', ['default', 'preflight'], { version: '2.1.0' });

    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    expect(entries.map((entry) => entry.name)).toStrictEqual(['default']);
  });

  it('runs a named kit from every configured package publishing it, in configured order', () => {
    installPackage('plain-kit', ['default', 'preflight']);
    installPackage('@acme/kits', ['default', 'preflight']);

    const entries = resolveKitSources({
      ...baseArgs,
      packages: true,
      configuredPackages: ['plain-kit', '@acme/kits'],
      kitSpecifiers: [{ kitName: 'preflight', checklists: [] }],
    });

    expect(entries.map((entry) => entry.provenance)).toStrictEqual([
      { kind: 'package', packageName: 'plain-kit', version: undefined },
      { kind: 'package', packageName: '@acme/kits', version: undefined },
    ]);
  });

  // A package that does not publish the named kit is not participating in the selection, not drifting.
  it('skips a configured package that does not publish the named kit', () => {
    installPackage('plain-kit', ['default']);
    installPackage('@acme/kits', ['default', 'preflight']);

    const entries = resolveKitSources({
      ...baseArgs,
      packages: true,
      configuredPackages: ['plain-kit', '@acme/kits'],
      kitSpecifiers: [{ kitName: 'preflight', checklists: [] }],
    });

    expect(entries.map((entry) => entry.name)).toStrictEqual(['preflight']);
  });

  // The order `rdy run a b` runs them in against a single source.
  it('orders several named kits name-major across the configured packages', () => {
    installPackage('plain-kit', ['drift', 'preflight']);
    installPackage('@acme/kits', ['drift', 'preflight']);

    const entries = resolveKitSources({
      ...baseArgs,
      packages: true,
      configuredPackages: ['plain-kit', '@acme/kits'],
      kitSpecifiers: [
        { kitName: 'drift', checklists: [] },
        { kitName: 'preflight', checklists: [] },
      ],
    });

    expect(entries.map(describeEntry)).toStrictEqual([
      'plain-kit:drift',
      '@acme/kits:drift',
      'plain-kit:preflight',
      '@acme/kits:preflight',
    ]);
  });

  // Selection reads names, so the manifest-less path needs no handling of its own — but it has to answer alike.
  it('selects by name when a package ships no manifest', () => {
    installPackage('plain-kit', ['default', 'preflight'], { hasManifest: false });

    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['plain-kit'] });

    expect(entries.map((entry) => entry.name)).toStrictEqual(['default']);
  });

  // A package publishing no `default` requires nothing of this project, so there is nothing to fail.
  it('skips a configured package publishing no default', () => {
    installPackage('plain-kit', ['default']);
    installPackage('@acme/kits', ['drift', 'preflight']);

    const entries = resolveKitSources({
      ...baseArgs,
      packages: true,
      configuredPackages: ['plain-kit', '@acme/kits'],
    });

    expect(entries.map(describeEntry)).toStrictEqual(['plain-kit:default']);
  });

  // Nothing published to align with is alignment, not a failure to check.
  it('selects nothing when no configured package publishes a default', () => {
    installPackage('@acme/kits', ['drift', 'preflight']);

    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    expect(entries).toStrictEqual([]);
  });

  it('passes without running a kit when the selection is empty', async () => {
    installPackage('@acme/kits', ['drift']);
    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    const exitCode = await runCommand({ kitEntries: entries, json: false });

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toBe('No kits to run.\n');
  });

  // Answering with an empty pass would be the clean report of nothing checked.
  it('rejects a named kit no configured package publishes', async () => {
    installPackage('@acme/kits', ['default', 'preflight']);

    const error = await captureRdyError(() => {
      resolveKitSources({
        ...baseArgs,
        packages: true,
        configuredPackages: ['@acme/kits'],
        kitSpecifiers: [{ kitName: 'absent', checklists: [] }],
      });
      return 0;
    });

    expect(error.code).toBe('usage');
    expect(error.message).toBe(
      'No configured package publishes a kit named "absent"; available kits: default, preflight.',
    );
  });

  // Reporting a clean pass having checked nothing is the one outcome a verification tool must not invent.
  it('rejects --packages when no package is configured', async () => {
    const error = await captureRdyError(() => {
      resolveKitSources({ ...baseArgs, packages: true, configuredPackages: [] });
      return 0;
    });

    expect(error.code).toBe('usage');
    expect(error.message).toMatch(/requires a "packages" list/);
  });

  it('carries the package and version into the JSON report', async () => {
    installPackage('@acme/kits', ['default'], { version: '2.1.0' });
    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    const exitCode = await runCommand({ kitEntries: entries, json: true });

    expect(exitCode).toBe(0);
    const report = ReportSchema.parse(JSON.parse(stdout.join('')));
    expect(report.kits[0]).toMatchObject({ name: 'default', origin: { package: '@acme/kits', version: '2.1.0' } });
  });

  it('omits the version from the report when the package declares none', async () => {
    installPackage('@acme/kits', ['default']);
    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    await runCommand({ kitEntries: entries, json: true });

    const report = ReportSchema.parse(JSON.parse(stdout.join('')));
    expect(report.kits[0]).toMatchObject({ origin: { package: '@acme/kits' } });
    expect(report.kits[0]?.origin).not.toHaveProperty('version');
  });

  it('names the readyup that compiled a package kit beside the package, not inside it', async () => {
    installPackage('@acme/kits', ['default'], { version: '2.1.0', readyupVersion: '0.19.2' });
    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    await runCommand({ kitEntries: entries, json: true });

    const report = ReportSchema.parse(JSON.parse(stdout.join('')));
    expect(report.kits[0]).toMatchObject({ compiledWith: '0.19.2', origin: { package: '@acme/kits' } });
    expect(report.kits[0]?.origin).not.toHaveProperty('compiledWith');
  });

  // A lone dependency-provided kit is the common shape, and its package appears nowhere else on screen.
  it('heads a single package kit with the package and version in human output', async () => {
    installPackage('@acme/kits', ['default'], { version: '2.1.0' });
    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    await runCommand({ kitEntries: entries, json: false });

    expect(stdout.join('')).toContain('\u{1F4E6} @acme/kits@2.1.0 / \u{1F4D3} default');
  });

  // The defect #238 reports: every package kit here runs one checklist, so the run tallied nothing at all.
  it('ends a multi-package run with a table covering every checklist that ran', async () => {
    installPackage('plain-kit', ['default'], { version: '1.0.0' });
    installPackage('@acme/kits', ['default'], { version: '2.1.0' });
    const entries = resolveKitSources({
      ...baseArgs,
      packages: true,
      configuredPackages: ['plain-kit', '@acme/kits'],
    });

    await runCommand({ kitEntries: entries, json: false });
    const lines = stdout.join('').trimEnd().split('\n');

    // Heading, rule, one row per checklist, rule, total.
    expect(lines.at(-6)).toContain('Summary');
    expect(lines.at(-4)).toContain('plain-kit@1.0.0 / default');
    expect(lines.at(-3)).toContain('@acme/kits@2.1.0 / default');
    expect(lines.at(-1)).toContain('Total: 2 passed');
  });

  // A row is an index into the blocks above it, so it repeats its heading rather than naming its own scheme.
  it('names each row by the breadcrumb heading its block carries', async () => {
    installPackage('@acme/kits', ['default'], { version: '2.1.0' });
    installPackage('plain-kit', ['default'], { version: '1.0.0' });
    const entries = resolveKitSources({
      ...baseArgs,
      packages: true,
      configuredPackages: ['@acme/kits', 'plain-kit'],
    });

    await runCommand({ kitEntries: entries, json: false });
    const output = stdout.join('');
    const headings = output
      .matchAll(/^\u{2501}\u{2501} \u{1F4E6} (?<crumb>.+)$/gmu)
      .map((match) => (match.groups?.['crumb'] ?? '').replaceAll(/\p{Emoji_Presentation} /gu, ''))
      .toArray();

    expect(headings).toStrictEqual(['@acme/kits@2.1.0 / default', 'plain-kit@1.0.0 / default']);
    for (const heading of headings) {
      expect(output).toContain(`\u{1F7E2} ${heading}`);
    }
  });

  // A kit that never loaded ran no checklist, and the ones that did are still worth tallying.
  it('tallies the checklists that ran when a kit fails to load', async () => {
    installPackage('@acme/kits', ['default'], { version: '2.1.0' });
    installPackage('plain-kit', ['default'], { version: '1.0.0' });
    installPackage('broken-kit', ['default'], { version: '3.0.0' });
    writeFileSync(
      path.join(process.cwd(), 'node_modules', 'broken-kit', '.readyup', 'kits', 'default.js'),
      'export default { nope: true };\n',
    );
    const entries = resolveKitSources({
      ...baseArgs,
      packages: true,
      configuredPackages: ['@acme/kits', 'broken-kit', 'plain-kit'],
    });

    await runCommand({ kitEntries: entries, json: false });
    const table = stdout.join('').split('\u{2501}\u{2501} Summary\n', 2)[1] ?? '';

    expect(table).toContain('@acme/kits@2.1.0 / default');
    expect(table).toContain('plain-kit@1.0.0 / default');
    expect(table).not.toContain('broken-kit');
    expect(table).toContain('Total: 2 passed');
  });
});

// region | Helpers

/** Flags a `--packages` invocation leaves at their defaults. */
const baseArgs = {
  filePath: undefined,
  fromValue: undefined,
  urlValue: undefined,
  kitSpecifiers: [],
  checklists: undefined,
  jit: false,
  internal: false,
};

/** Names a run entry as the package it came from and the kit it runs, which is what an order assertion reads. */
function describeEntry(entry: ResolvedKitEntry): string {
  const origin = entry.provenance?.kind === 'package' ? entry.provenance.packageName : entry.provenance?.kind;
  return `${origin}:${entry.name}`;
}

/** Installs a package publishing the named kits, each holding one passing check. */
function installPackage(name: string, kits: string[], options: InstallPackageOptions = {}): void {
  const { hasManifest = true, readyupVersion, version } = options;
  const root = path.join(process.cwd(), 'node_modules', name);
  mkdirSync(path.join(root, '.readyup', 'kits'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, ...(version !== undefined && { version }) }));

  for (const kit of kits) {
    const body = `export default { checklists: [{ name: '${kit}', checks: [{ name: 'ok', check: () => true }] }] };\n`;
    const stamp = readyupVersion === undefined ? '' : `export const __readyupVersion = '${readyupVersion}';\n`;
    writeFileSync(path.join(root, '.readyup', 'kits', `${kit}.js`), `${stamp}${body}`);
  }
  if (hasManifest) {
    writeFileSync(
      path.join(root, '.readyup', 'manifest.json'),
      JSON.stringify({ version: 1, kits: kits.map((kit) => ({ name: kit })) }),
    );
  }
}

interface InstallPackageOptions {
  hasManifest?: boolean;
  readyupVersion?: string;
  version?: string;
}

// endregion | Helpers
