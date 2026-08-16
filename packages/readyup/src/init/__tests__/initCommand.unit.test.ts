import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initCommand } from '../initCommand.ts';
import { rdyConfigTemplate, rdyKitTemplate } from '../templates.ts';

const TEST_DIR = join(import.meta.dirname, '../../../.test-tmp');
const CONFIG_PATH = '.config/readyup.config.ts';
const KIT_PATH = '.readyup/kits/default.ts';

describe(initCommand, () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('scaffolds both config and kit files and returns 0', () => {
    using _silent = silenceConsole(['error', 'info']);

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
    using _silent = silenceConsole(['error', 'info']);

    mkdirSync(join(TEST_DIR, '.config'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.readyup/kits'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONFIG_PATH), 'existing config', 'utf8');
    writeFileSync(join(TEST_DIR, KIT_PATH), 'existing kit', 'utf8');

    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
    expect(readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8')).toBe('existing config');
    expect(readFileSync(join(TEST_DIR, KIT_PATH), 'utf8')).toBe('existing kit');
  });

  it('overwrites existing files when force is true', () => {
    using _silent = silenceConsole(['error', 'info']);

    mkdirSync(join(TEST_DIR, '.config'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.readyup/kits'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONFIG_PATH), 'old config', 'utf8');
    writeFileSync(join(TEST_DIR, KIT_PATH), 'old kit', 'utf8');

    const exitCode = initCommand({ dryRun: false, force: true });

    expect(exitCode).toBe(0);
    expect(readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8')).toBe(rdyConfigTemplate);
    expect(readFileSync(join(TEST_DIR, KIT_PATH), 'utf8')).toBe(rdyKitTemplate);
  });

  it('previews without writing when dry-run is true', () => {
    using _silent = silenceConsole(['error', 'info']);

    const exitCode = initCommand({ dryRun: true, force: false });

    expect(exitCode).toBe(0);
    expect(existsSync(join(TEST_DIR, CONFIG_PATH))).toBe(false);
    expect(existsSync(join(TEST_DIR, KIT_PATH))).toBe(false);
  });

  it('reports up-to-date when both files match the templates', () => {
    using _silent = silenceConsole(['error', 'info']);

    mkdirSync(join(TEST_DIR, '.config'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.readyup/kits'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONFIG_PATH), rdyConfigTemplate, 'utf8');
    writeFileSync(join(TEST_DIR, KIT_PATH), rdyKitTemplate, 'utf8');

    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
    expect(readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8')).toBe(rdyConfigTemplate);
    expect(readFileSync(join(TEST_DIR, KIT_PATH), 'utf8')).toBe(rdyKitTemplate);
  });

  it('does not modify existing files during dry-run', () => {
    using _silent = silenceConsole(['error', 'info']);

    mkdirSync(join(TEST_DIR, '.config'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.readyup/kits'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONFIG_PATH), 'existing config', 'utf8');
    writeFileSync(join(TEST_DIR, KIT_PATH), 'existing kit', 'utf8');

    const exitCode = initCommand({ dryRun: true, force: false });

    expect(exitCode).toBe(0);
    expect(readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8')).toBe('existing config');
    expect(readFileSync(join(TEST_DIR, KIT_PATH), 'utf8')).toBe('existing kit');
  });

  it('does not overwrite during dry-run even with force', () => {
    using _silent = silenceConsole(['error', 'info']);

    mkdirSync(join(TEST_DIR, '.config'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.readyup/kits'), { recursive: true });
    writeFileSync(join(TEST_DIR, CONFIG_PATH), 'existing config', 'utf8');
    writeFileSync(join(TEST_DIR, KIT_PATH), 'existing kit', 'utf8');

    const exitCode = initCommand({ dryRun: true, force: true });

    expect(exitCode).toBe(0);
    expect(readFileSync(join(TEST_DIR, CONFIG_PATH), 'utf8')).toBe('existing config');
    expect(readFileSync(join(TEST_DIR, KIT_PATH), 'utf8')).toBe('existing kit');
  });

  it('does not print next steps during dry-run', () => {
    using silent = silenceConsole(['error', 'info']);

    const exitCode = initCommand({ dryRun: true, force: false });

    expect(exitCode).toBe(0);
    const infoMessages = silent.info.mock.calls.map((c) => String(c[0]));
    expect(infoMessages.some((m) => m.includes('Next steps'))).toBe(false);
  });

  it('prints next steps after successful scaffolding', () => {
    using silent = silenceConsole(['error', 'info']);

    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
    const infoMessages = silent.info.mock.calls.map((c) => String(c[0]));
    expect(infoMessages.some((m) => m.includes('Next steps'))).toBe(true);
  });
});
