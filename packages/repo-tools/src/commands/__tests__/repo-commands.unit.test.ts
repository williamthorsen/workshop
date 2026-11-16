import { describe, expect, it } from 'vitest';

import { STACK_DETECTORS } from '../../stacks/stack-detectors.ts';
import { REPO_COMMANDS } from '../repo-commands.ts';
import { runCaptured } from '../test-utils/run-captured.ts';

describe('REPO_COMMANDS', () => {
  describe('help', () => {
    it.each([[[]], [['--help']], [['-h']]])('prints the same help to stdout and returns 0 for %j', async (argv) => {
      const result = await runCaptured(argv);
      expect(result.stdout).toBe((await runCaptured(['--help'])).stdout);
      expect(result.stdout).toContain('Usage: thor-repo');
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });

    it('lists every stack name and states the live guard', async () => {
      const { stdout } = await runCaptured(['--help']);
      expect(stdout).toContain(`Stack names: ${Object.keys(STACK_DETECTORS).join(', ')}`);
      expect(stdout).toContain(
        '--write and move refuse a registry whose resolved file is in a checkout on a branch named live',
      );
    });

    it('names each verb', () => {
      expect(Object.keys(REPO_COMMANDS.commands)).toStrictEqual(['add', 'apply-moves', 'list', 'move', 'scan']);
    });
  });

  describe('arguments', () => {
    it.each([
      [['frob']],
      [['list', '--bogus']],
      [['list', '--tag']],
      [['list', '--clone', 'gone']],
      [['list', '--file', '']],
      [['list', 'extra']],
      [['scan', '--json']],
      [['scan', 'extra']],
      [['list', '--write']],
      [['add']],
      [['add', 'one', 'two']],
      [['move', 'alpha']],
      [['move', 'alpha', '~/x', 'extra']],
      [['apply-moves', 'alpha']],
    ])('rejects %j as a usage error', async (argv) => {
      const result = await runCaptured(argv);
      expect(result.stderr).toMatch(/^thor-repo: /);
      expect(result.stdout).toBe('');
      expect(result.status).toBe(2);
    });
  });
});
