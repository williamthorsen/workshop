import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture, silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { initCommand } from '../initCommand.ts';
import { rdyConfigTemplate, rdyKitTemplate } from '../templates.ts';

const CONFIG_PATH = '.config/readyup.config.ts';
const KIT_PATH = '.readyup/kits/default.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-init-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  // `scaffoldConfig` writes relative paths, which resolve against the real process directory.
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runTest();
});

describe(initCommand, () => {
  it('scaffolds both config and kit files and returns 0', ({ temp }) => {
    using _silent = silenceConsole(['error', 'info']);

    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
    expect(temp.exists(CONFIG_PATH)).toBe(true);
    expect(temp.exists(KIT_PATH)).toBe(true);

    const configContent = temp.read(CONFIG_PATH);
    expect(configContent).toBe(rdyConfigTemplate);

    const kitContent = temp.read(KIT_PATH);
    expect(kitContent).toBe(rdyKitTemplate);
  });

  it('skips with a warning when both files already exist', ({ temp }) => {
    using _silent = silenceConsole(['error', 'info']);

    temp.write(CONFIG_PATH, 'existing config');
    temp.write(KIT_PATH, 'existing kit');

    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
    expect(temp.read(CONFIG_PATH)).toBe('existing config');
    expect(temp.read(KIT_PATH)).toBe('existing kit');
  });

  it('overwrites existing files when force is true', ({ temp }) => {
    using _silent = silenceConsole(['error', 'info']);

    temp.write(CONFIG_PATH, 'old config');
    temp.write(KIT_PATH, 'old kit');

    const exitCode = initCommand({ dryRun: false, force: true });

    expect(exitCode).toBe(0);
    expect(temp.read(CONFIG_PATH)).toBe(rdyConfigTemplate);
    expect(temp.read(KIT_PATH)).toBe(rdyKitTemplate);
  });

  it('previews without writing when dry-run is true', ({ temp }) => {
    using _silent = silenceConsole(['error', 'info']);

    const exitCode = initCommand({ dryRun: true, force: false });

    expect(exitCode).toBe(0);
    expect(temp.exists(CONFIG_PATH)).toBe(false);
    expect(temp.exists(KIT_PATH)).toBe(false);
  });

  it('reports up-to-date when both files match the templates', ({ temp }) => {
    using _silent = silenceConsole(['error', 'info']);

    temp.write(CONFIG_PATH, rdyConfigTemplate);
    temp.write(KIT_PATH, rdyKitTemplate);

    const exitCode = initCommand({ dryRun: false, force: false });

    expect(exitCode).toBe(0);
    expect(temp.read(CONFIG_PATH)).toBe(rdyConfigTemplate);
    expect(temp.read(KIT_PATH)).toBe(rdyKitTemplate);
  });

  it('does not modify existing files during dry-run', ({ temp }) => {
    using _silent = silenceConsole(['error', 'info']);

    temp.write(CONFIG_PATH, 'existing config');
    temp.write(KIT_PATH, 'existing kit');

    const exitCode = initCommand({ dryRun: true, force: false });

    expect(exitCode).toBe(0);
    expect(temp.read(CONFIG_PATH)).toBe('existing config');
    expect(temp.read(KIT_PATH)).toBe('existing kit');
  });

  it('does not overwrite during dry-run even with force', ({ temp }) => {
    using _silent = silenceConsole(['error', 'info']);

    temp.write(CONFIG_PATH, 'existing config');
    temp.write(KIT_PATH, 'existing kit');

    const exitCode = initCommand({ dryRun: true, force: true });

    expect(exitCode).toBe(0);
    expect(temp.read(CONFIG_PATH)).toBe('existing config');
    expect(temp.read(KIT_PATH)).toBe('existing kit');
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
