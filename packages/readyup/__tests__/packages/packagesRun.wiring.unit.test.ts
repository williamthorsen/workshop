import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveKitSources, runCommand } from '../../src/cli.ts';
import { ReportSchema } from '../../src/schemas/index.ts';
import { captureRdyError } from '../../src/test-utils/captureRdyError.ts';

/**
 * Joins `--packages` to the kits an installed package publishes, against a real fixture project. The
 * unit tests cover the expansion and the resolver separately; this locks in the seam between them —
 * that a configured package becomes a run entry carrying the provenance the report and the headings
 * render.
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
    installPackage('@acme/kits', ['drift', 'preflight'], '2.1.0');

    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    expect(entries).toStrictEqual([
      {
        name: 'drift',
        source: { path: path.join(projectRoot, 'node_modules', '@acme/kits', '.readyup', 'kits', 'drift.js') },
        checklists: [],
        origin: { packageName: '@acme/kits', version: '2.1.0' },
      },
      {
        name: 'preflight',
        source: { path: path.join(projectRoot, 'node_modules', '@acme/kits', '.readyup', 'kits', 'preflight.js') },
        checklists: [],
        origin: { packageName: '@acme/kits', version: '2.1.0' },
      },
    ]);
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
    installPackage('@acme/kits', ['drift'], '2.1.0');
    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    const exitCode = await runCommand({ kitEntries: entries, json: true });

    expect(exitCode).toBe(0);
    const report = ReportSchema.parse(JSON.parse(stdout.join('')));
    expect(report.kits[0]).toMatchObject({ name: 'drift', origin: { package: '@acme/kits', version: '2.1.0' } });
  });

  it('omits the version from the report when the package declares none', async () => {
    installPackage('@acme/kits', ['drift'], undefined);
    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    await runCommand({ kitEntries: entries, json: true });

    const report = ReportSchema.parse(JSON.parse(stdout.join('')));
    expect(report.kits[0]).toMatchObject({ origin: { package: '@acme/kits' } });
    expect(report.kits[0]?.origin).not.toHaveProperty('version');
  });

  // A lone dependency-provided kit is the common shape, and its package appears nowhere else on screen.
  it('heads a single package kit with the package and version in human output', async () => {
    installPackage('@acme/kits', ['drift'], '2.1.0');
    const entries = resolveKitSources({ ...baseArgs, packages: true, configuredPackages: ['@acme/kits'] });

    await runCommand({ kitEntries: entries, json: false });

    expect(stdout.join('')).toContain('drift (@acme/kits@2.1.0)');
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

/** Installs a package publishing the named kits, each holding one passing check. */
function installPackage(name: string, kits: string[], version: string | undefined): void {
  const root = path.join(process.cwd(), 'node_modules', name);
  mkdirSync(path.join(root, '.readyup', 'kits'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, ...(version !== undefined && { version }) }));

  for (const kit of kits) {
    const body = `export default { checklists: [{ name: '${kit}', checks: [{ name: 'ok', check: () => true }] }] };\n`;
    writeFileSync(path.join(root, '.readyup', 'kits', `${kit}.js`), body);
  }
  writeFileSync(
    path.join(root, '.readyup', 'manifest.json'),
    JSON.stringify({ version: 1, kits: kits.map((kit) => ({ name: kit })) }),
  );
}

// endregion | Helpers
