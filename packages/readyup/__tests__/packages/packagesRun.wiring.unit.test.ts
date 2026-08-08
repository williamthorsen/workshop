import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ResolvedKitEntry, resolveKitSources, runCommand } from '../../src/cli.ts';
import { ReportSchema } from '../../src/schemas/index.ts';
import { captureRdyError } from '../../src/test-utils/captureRdyError.ts';

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

  // Drift between a hand-maintained list and a convention readyup's own `publishing` kit enforces.
  it('fails a configured package publishing no default, naming what it does publish', async () => {
    installPackage('@acme/kits', ['drift', 'preflight']);

    const error = await captureRdyError(() => {
      resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });
      return 0;
    });

    expect(error.code).toBe('config');
    expect(error.message).toBe(
      'Configured package "@acme/kits" publishes no kit named "default"; it publishes: drift, preflight.',
    );
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
