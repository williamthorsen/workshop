import assert from 'node:assert';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { compileConfig } from '../../../src/compile/compileConfig.ts';
import { validateCompiledOutput } from '../../../src/compile/validateCompiledOutput.ts';
import { listCommand } from '../../../src/list/listCommand.ts';
import type { RdyManifestKit } from '../../../src/manifest/manifestSchema.ts';
import { ListOutputSchema } from '../../../src/schemas/listOutputSchema.ts';
import type { JsonKitResultEntry, JsonReport } from '../../../src/schemas/reportSchema.ts';
import { ReportSchema } from '../../../src/schemas/reportSchema.ts';
import { resolveKitSources, runCommand } from '../../../src/run/runCommand.ts';
import { hashFile } from '../../../src/verify/targetHash.ts';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const KIT_SOURCE_DIR = path.resolve(import.meta.dirname, '..');
const KIT_NAMES = ['default', 'publishing'];

/** Flags a `--from` invocation leaves at their defaults. */
const baseArgs = {
  filePath: undefined,
  fromValue: undefined,
  urlValue: undefined,
  kitSpecifiers: [],
  checklists: undefined,
  jit: false,
  internal: false,
};

/**
 * Reaches the kits readyup publishes the way a consuming project does, through `--from npm:readyup`
 * against a real `node_modules` tree.
 *
 * The fixture installs the kits by compiling this package's own sources, so the test exercises what
 * ships without waiting on the `prepare` that produces it. The kits' own unit tests cover what each
 * check decides; this locks in the seam that carries them to a consumer -- that the bundles load from
 * an installed package, and that the manifest beside them is what `list` reports.
 */
describe('kits readyup publishes', () => {
  let projectRoot: string;
  let originalCwd: string;
  let stdout: string[];

  beforeAll(async () => {
    projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'bundled-kits-')));
    await installReadyupKits(projectRoot);
  });

  beforeEach(() => {
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
  });

  afterAll(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('lists both kits with the checklists each one carries', async () => {
    const exitCode = await listCommand(['--from', 'npm:readyup', '--json']);

    expect(exitCode).toBe(0);
    const listed = ListOutputSchema.parse(JSON.parse(stdout.join('')));
    expect(listed.kits.map((kit) => kit.name)).toStrictEqual(KIT_NAMES);
    expect(listed.kits[0]).toMatchObject({ checklists: ['setup', 'freshness'] });
    expect(listed.kits[1]).toMatchObject({ checklists: ['packaging', 'freshness', 'self-containment'] });
  });

  it('runs the default kit on a bare invocation', async () => {
    const entries = resolveKitSources({ ...baseArgs, fromValue: 'npm:readyup' });

    await runCommand({ kitEntries: entries, json: true });

    const kit = pickKitResult(ReportSchema.parse(JSON.parse(stdout.join(''))), 'default');
    expect(kit).toMatchObject({ origin: { package: 'readyup' } });
    expect(kit.checklists.map((checklist) => checklist.name)).toStrictEqual(['setup', 'freshness']);
  });

  it('runs the publishing kit when it is named', async () => {
    const entries = resolveKitSources({
      ...baseArgs,
      fromValue: 'npm:readyup',
      kitSpecifiers: [{ kitName: 'publishing', checklists: [] }],
    });

    await runCommand({ kitEntries: entries, json: true });

    const kit = pickKitResult(ReportSchema.parse(JSON.parse(stdout.join(''))), 'publishing');
    expect(kit.checklists.map((checklist) => checklist.name)).toStrictEqual([
      'packaging',
      'freshness',
      'self-containment',
    ]);
  });

  // The kits read the consuming project's working directory, and this one defines no kits of its own.
  // Every setup check standing down is what says so: a pass would mean they had judged readyup's own
  // kit directory, which travelled in with the package.
  it('judges the consuming project rather than the package it came from', async () => {
    const entries = resolveKitSources({ ...baseArgs, fromValue: 'npm:readyup' });

    const exitCode = await runCommand({ kitEntries: entries, json: true });

    const kit = pickKitResult(ReportSchema.parse(JSON.parse(stdout.join(''))), 'default');
    const setup = kit.checklists.find((checklist) => checklist.name === 'setup');
    expect(setup?.counts).toMatchObject({ passed: 0, warnings: 0, optional: 2 });
    expect(exitCode).toBe(0);
  });
});

// region | Helpers

/** The report entry for a kit that ran, failing the test when the runner reported a load error instead. */
function pickKitResult(report: JsonReport, kitName: string): JsonKitResultEntry {
  const kit = report.kits.find((candidate) => candidate.name === kitName);
  assert.ok(kit !== undefined, `Report carries no entry named "${kitName}"`);
  assert.ok(!('error' in kit), `Kit "${kitName}" failed to load`);
  return kit;
}

/**
 * Installs this package's kits into a fixture project as an npm dependency would carry them.
 *
 * The inner symlink is what lets the bundles resolve the `readyup` specifiers `rdy compile` leaves
 * external. A real consumer gets that from the runner's resolver hook, which `rdy` registers before
 * loading any kit; a test calling the library directly has no runner to register it.
 */
async function installReadyupKits(projectRoot: string): Promise<void> {
  const packageRoot = path.join(projectRoot, 'node_modules', 'readyup');
  mkdirSync(path.join(packageRoot, '.readyup', 'kits'), { recursive: true });
  mkdirSync(path.join(packageRoot, 'node_modules'), { recursive: true });
  symlinkSync(PACKAGE_ROOT, path.join(packageRoot, 'node_modules', 'readyup'), 'dir');
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'readyup', version: '0.0.0-fixture' }));

  const kits: RdyManifestKit[] = [];
  for (const name of KIT_NAMES) {
    const outputPath = path.join(packageRoot, '.readyup', 'kits', `${name}.js`);
    const result = await compileConfig(path.join(KIT_SOURCE_DIR, `${name}.ts`), outputPath);
    const metadata = await validateCompiledOutput(result.outputPath);
    kits.push({
      name,
      path: path.posix.join('kits', `${name}.js`),
      checklists: metadata.checklists,
      targetHash: hashFile(result.outputPath),
    });
  }

  writeFileSync(path.join(packageRoot, '.readyup', 'manifest.json'), JSON.stringify({ version: 1, kits }));
}

// endregion | Helpers
