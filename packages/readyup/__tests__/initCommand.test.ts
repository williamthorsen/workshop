import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initCommand } from '../src/init/initCommand.ts';
import { rdyConfigTemplate, rdyKitTemplate } from '../src/init/templates.ts';

const TEST_DIR = join(import.meta.dirname, '../.test-tmp');
const CONFIG_PATH = '.config/rdy.config.ts';
const KIT_PATH = '.rdy/kits/default.ts';

describe(initCommand, () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('scaffolds both config and kit files and returns 0', () => {
    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
    expect(existsSync(join(TEST_DIR, CONFIG_PATH))).toBe(true);
    expect(existsSync(join(TEST_DIR, KIT_PATH))).toBe(true);

    const configContent = readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8');
    expect(configContent).toBe(rdyConfigTemplate);

    const kitContent = readFileSync(join(TEST_DIR, KIT_PATH), 'utf8');
    expect(kitContent).toBe(rdyKitTemplate);
  });

  it('skips with a warning when both files already exist', () => {
    mkdirSync(join(TEST_DIR, '.config'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.rdy/kits'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONFIG_PATH), 'existing config', 'utf8');
    writeFileSync(join(TEST_DIR, KIT_PATH), 'existing kit', 'utf8');

    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
    expect(readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8')).toBe('existing config');
    expect(readFileSync(join(TEST_DIR, KIT_PATH), 'utf8')).toBe('existing kit');
  });

  it('overwrites existing files when force is true', () => {
    mkdirSync(join(TEST_DIR, '.config'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.rdy/kits'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONFIG_PATH), 'old config', 'utf8');
    writeFileSync(join(TEST_DIR, KIT_PATH), 'old kit', 'utf8');

    const exitCode = initCommand({ dryRun: false, force: true });

    expect(exitCode).toBe(0);
    expect(readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8')).toBe(rdyConfigTemplate);
    expect(readFileSync(join(TEST_DIR, KIT_PATH), 'utf8')).toBe(rdyKitTemplate);
  });

  it('previews without writing when dry-run is true', () => {
    const exitCode = initCommand({ dryRun: true, force: false });

    expect(exitCode).toBe(0);
    expect(existsSync(join(TEST_DIR, CONFIG_PATH))).toBe(false);
    expect(existsSync(join(TEST_DIR, KIT_PATH))).toBe(false);
  });

  it('reports up-to-date when both files match the templates', () => {
    mkdirSync(join(TEST_DIR, '.config'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.rdy/kits'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONFIG_PATH), rdyConfigTemplate, 'utf8');
    writeFileSync(join(TEST_DIR, KIT_PATH), rdyKitTemplate, 'utf8');

    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
    expect(readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8')).toBe(rdyConfigTemplate);
    expect(readFileSync(join(TEST_DIR, KIT_PATH), 'utf8')).toBe(rdyKitTemplate);
  });

  it('does not modify existing files during dry-run', () => {
    mkdirSync(join(TEST_DIR, '.config'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.rdy/kits'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONFIG_PATH), 'existing config', 'utf8');
    writeFileSync(join(TEST_DIR, KIT_PATH), 'existing kit', 'utf8');

    const exitCode = initCommand({ dryRun: true, force: false });

    expect(exitCode).toBe(0);
    expect(readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8')).toBe('existing config');
    expect(readFileSync(join(TEST_DIR, KIT_PATH), 'utf8')).toBe('existing kit');
  });

  it('does not overwrite during dry-run even with force', () => {
    mkdirSync(join(TEST_DIR, '.config'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.rdy/kits'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONFIG_PATH), 'existing config', 'utf8');
    writeFileSync(join(TEST_DIR, KIT_PATH), 'existing kit', 'utf8');

    const exitCode = initCommand({ dryRun: true, force: true });

    expect(exitCode).toBe(0);
    expect(readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8')).toBe('existing config');
    expect(readFileSync(join(TEST_DIR, KIT_PATH), 'utf8')).toBe('existing kit');
  });

  it('does not print next steps during dry-run', () => {
    const exitCode = initCommand({ dryRun: true, force: false });

    expect(exitCode).toBe(0);
    const infoMessages = vi.mocked(console.info).mock.calls.map((c) => String(c[0]));
    expect(infoMessages.some((m) => m.includes('Next steps'))).toBe(false);
  });

  it('prints next steps after successful scaffolding', () => {
    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
    const infoMessages = vi.mocked(console.info).mock.calls.map((c) => String(c[0]));
    expect(infoMessages.some((m) => m.includes('Next steps'))).toBe(true);
  });
});
