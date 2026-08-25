import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { COMMAND_NAMES, routeCommand } from '../../bin/route.ts';
import { COMMAND_HELP } from '../helpText.ts';
import { TOPICS } from '../topics.ts';

describe('rdy help', () => {
  it.each([
    { label: 'no argument', args: ['help'] },
    { label: 'the long help flag', args: ['help', '--help'] },
    { label: 'the short help flag', args: ['help', '-h'] },
  ])('prints the top-level help for $label', async ({ args }) => {
    const bare = await route(['--help']);
    const viaHelp = await route(args);

    expect(viaHelp.exitCode).toBe(0);
    expect(viaHelp.stdout).toBe(bare.stdout);
  });

  it.each(Object.keys(COMMAND_HELP).map((command) => ({ command })))(
    'prints for "help $command" what "$command --help" prints',
    async ({ command }) => {
      const viaFlag = await route(command === 'help' ? ['--help'] : [command, '--help']);
      const viaHelp = await route(['help', command]);

      expect(viaHelp.exitCode).toBe(0);
      expect(viaHelp.stdout).toBe(viaFlag.stdout);
    },
  );

  it.each(Object.entries(TOPICS).map(([topic, { heading }]) => ({ heading, topic })))(
    'prints the README section for topic $topic',
    async ({ heading, topic }) => {
      const { exitCode, stdout } = await route(['help', topic]);

      expect(exitCode).toBe(0);
      expect(stdout.startsWith(`## ${heading}\n`)).toBe(true);
    },
  );

  it('includes the subsections of a topic that has them', async () => {
    const { stdout } = await route(['help', 'concepts']);

    expect(stdout).toContain('### Severities');
    expect(stdout).toContain('### Thresholds');
    expect(stdout).not.toContain('## Authoring kits');
  });

  it('suggests the nearest subject for a near-miss', async () => {
    const { exitCode, stderr } = await route(['help', 'authorng']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("No help available for 'authorng'. Did you mean 'rdy help authoring'?");
    expect(stderr).toContain("Run 'rdy help' for a list of topics.");
  });

  it('suggests nothing for an argument close to no subject', async () => {
    const { exitCode, stderr } = await route(['help', 'zzzzz']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("No help available for 'zzzzz'.");
    expect(stderr).not.toContain('Did you mean');
    expect(stderr).toContain("Run 'rdy help' for a list of topics.");
  });

  it.each([
    { subject: 'toString' },
    { subject: '__proto__' },
    { subject: 'constructor' },
    { subject: 'valueOf' },
    { subject: 'hasOwnProperty' },
  ])('rejects $subject, which the lookup tables inherit rather than declare', async ({ subject }) => {
    const { exitCode, stdout, stderr } = await route(['help', subject]);

    expect(exitCode).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain(`No help available for '${subject}'.`);
  });

  it.each([
    { label: 'a second subject', args: ['help', 'concepts', 'authoring'] },
    { label: 'an undeclared flag', args: ['help', '--bogus'] },
  ])('fails with a usage error for $label', async ({ args }) => {
    const { exitCode, stderr } = await route(args);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('Error:');
  });

  it('names the accepted shape when given a second subject', async () => {
    const { stderr } = await route(['help', 'concepts', 'authoring']);

    expect(stderr).toContain('Usage: rdy help [<command|topic>]');
  });

  it('diverts topic output to stderr under --json, leaving stdout to the JSON document', async () => {
    const { exitCode, stdout, stderr } = await route(['help', 'concepts', '--json']);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toContain('## Concepts');
  });

  it('matches a mistyped command against help as well as the rest', async () => {
    const { exitCode, stderr } = await route(['hlep']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("Did you mean 'rdy help'?");
  });

  it('offers help for every command the router matches a typo against', () => {
    expect(Object.keys(COMMAND_HELP).toSorted()).toStrictEqual(COMMAND_NAMES.toSorted());
  });
});

// region | Helpers

/** Runs the router with stdio captured, returning the exit code alongside what each stream received. */
async function route(args: string[]) {
  using io = captureStdio();

  const exitCode = await routeCommand(args);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

// endregion | Helpers
