import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureError, captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mockReaddirSync = vi.hoisted(() => vi.fn());

// Only directory reads are intercepted; the temporary tree still writes through to disk.
vi.mock(import('node:fs'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readdirSync: mockReaddirSync };
});

import { RdyError } from '../../errors/RdyError.ts';
import { setStyle } from '../../layout/engine.ts';
import { ListOutputSchema } from '../../schemas/listOutputSchema.ts';
import { useFailingDirectoryRead } from '../../test-utils/useFailingDirectoryRead.ts';
import { listCommand } from '../listCommand.ts';

const it = test
  .extend(
    'temp',
    makeFixture(() =>
      createTempTree(
        {
          // Sweep root, holding one kit of its own.
          'package.json': JSON.stringify({ name: 'root' }),
          '.readyup/kits/demo.js': 'export default {};',
          '.readyup/manifest.json': JSON.stringify({
            version: 1,
            kits: [{ name: 'demo', path: 'kits/demo.js' }],
          }),

          // Two kits with descriptions, on the convention output directory.
          'packages/readyup/package.json': JSON.stringify({ name: 'readyup' }),
          'packages/readyup/.readyup/kits/default.js': 'export default {};',
          'packages/readyup/.readyup/kits/publishing.js': 'export default {};',
          'packages/readyup/.readyup/manifest.json': JSON.stringify({
            version: 1,
            kits: [
              {
                name: 'default',
                path: 'kits/default.js',
                description: 'Authoring hygiene for a project that defines readyup kits',
                readyupVersion: '0.24.0',
              },
              {
                name: 'publishing',
                path: 'kits/publishing.js',
                description: 'Publication readiness for a package that ships readyup kits',
              },
            ],
          }),

          // A relocated output directory, compiled with no manifest beside its kits.
          'packages/tooling/package.json': JSON.stringify({ name: 'tooling' }),
          'packages/tooling/.config/readyup.config.ts':
            "export default { compile: { srcDir: 'kit-sources', outDir: 'dist/kits' } };",
          'packages/tooling/dist/kits/lint.js': 'export default {};',

          // One kit, no description recorded for it.
          'packages/ui/package.json': JSON.stringify({ name: 'ui' }),
          'packages/ui/.readyup/kits/default.js': 'export default {};',
          'packages/ui/.readyup/manifest.json': JSON.stringify({
            version: 1,
            kits: [{ name: 'default', path: 'kits/default.js' }],
          }),

          // Discovered for its sources, with nothing compiled to show.
          'packages/authored/package.json': JSON.stringify({ name: 'authored' }),
          'packages/authored/.readyup/kits/default.ts': 'export default {};',

          // Discovered for its manifest, which now lists nothing.
          'packages/emptied/package.json': JSON.stringify({ name: 'emptied' }),
          'packages/emptied/.readyup/manifest.json': JSON.stringify({ version: 1, kits: [] }),

          // Compiled kits beside a manifest that cannot be parsed.
          'packages/corrupt/package.json': JSON.stringify({ name: 'corrupt' }),
          'packages/corrupt/.readyup/kits/audit.js': 'export default {};',
          'packages/corrupt/.readyup/manifest.json': '{ "version": 1, "kits": [',

          // Discovered for its sources, with its output directory barred to the process.
          'packages/blocked/package.json': JSON.stringify({ name: 'blocked' }),
          'packages/blocked/.config/readyup.config.ts':
            "export default { compile: { srcDir: 'kit-sources', outDir: 'dist/kits' } };",
          'packages/blocked/kit-sources/probe.ts': 'export default {};',
          'packages/blocked/dist/kits/probe.js': 'export default {};',
        },
        { prefix: 'rdy-recursive-' },
      ),
    ),
  )
  .extend('reads', { auto: true }, ({ temp }) => useFailingDirectoryRead(mockReaddirSync, temp.dir));

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe('list --recursive', () => {
  afterEach(() => {
    setStyle('rich');
  });

  describe('rendering', () => {
    it('groups kits under the project holding them, the sweep root first', async () => {
      const { exitCode, stdout } = await list(['--recursive']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('\u{2501}\u{2501} \u{1F4C1} ./');
      expect(stdout).toContain('\u{2501}\u{2501} \u{1F4C1} packages/readyup/');
      expect(stdout.indexOf('./')).toBeLessThan(stdout.indexOf('packages/readyup/'));
    });

    it('names a command that runs each project\u{2019}s kits from the sweep root', async () => {
      const { stdout } = await list(['--recursive']);

      expect(stdout).toContain('rdy run <name>');
      expect(stdout).toContain('rdy run --from packages/readyup [<name>]');
    });

    it('reports the descriptions the manifest records, and renders a bare name without one', async () => {
      const { stdout } = await list(['--recursive']);

      expect(stdout).toContain('\u{1F4D3} default \u{00B7} Authoring hygiene for a project that defines readyup kits');
      expect(stdout).toContain('\u{1F4D3} demo');
      expect(stdout).not.toContain('demo \u{00B7}');
    });

    it('reaches a project on a relocated output directory by file path', async () => {
      const { stdout } = await list(['--recursive']);

      expect(stdout).toContain('rdy run --file <file path>');
      expect(stdout).toContain('\u{1F4D3} packages/tooling/dist/kits/lint.js');
    });

    it('omits a project with nothing compiled to show', async () => {
      const { stdout } = await list(['--recursive']);

      expect(stdout).not.toContain('packages/authored');
      expect(stdout).not.toContain('packages/emptied');
    });

    // `--style` is consumed by the router before dispatch, so the style is bound here as the router binds it.
    it('degrades to ASCII in plain style', async () => {
      setStyle('plain');

      const { stdout } = await list(['--recursive']);

      expect(stdout).toContain('== packages/readyup/');
      expect(stdout).not.toContain('\u{1F4C1}');
    });
  });

  describe('JSON payload', () => {
    it('names the project each kit came from, and validates at schema version 1', async () => {
      const payload = await runForPayload();
      const parsed = ListOutputSchema.parse(payload);

      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.kits).toContainEqual({
        name: 'demo',
        kind: 'compiled',
        project: '.',
        path: '.readyup/kits/demo.js',
      });
      expect(parsed.kits).toContainEqual({
        name: 'default',
        kind: 'compiled',
        project: 'packages/readyup',
        path: 'packages/readyup/.readyup/kits/default.js',
        description: 'Authoring hygiene for a project that defines readyup kits',
        readyupVersion: '0.24.0',
      });
    });

    it('reports a project compiled without a manifest from the files on disk', async () => {
      const parsed = ListOutputSchema.parse(await runForPayload());

      expect(parsed.kits).toContainEqual({
        name: 'lint',
        kind: 'compiled',
        project: 'packages/tooling',
        path: 'packages/tooling/dist/kits/lint.js',
      });
    });

    it('emits no internal rows and no configured-package suggestions', async () => {
      const parsed = ListOutputSchema.parse(await runForPayload());

      expect(parsed.kits.every((kit) => kit.kind === 'compiled')).toBe(true);
      expect(parsed.availablePackages).toBeUndefined();
    });

    it('distinguishes two projects that each hold a kit of the same name', async () => {
      const parsed = ListOutputSchema.parse(await runForPayload());
      const defaults = parsed.kits.filter((kit) => kit.name === 'default');

      expect(defaults.map((kit) => kit.project)).toStrictEqual(['packages/readyup', 'packages/ui']);
    });
  });

  describe('an empty sweep', () => {
    it('emits an empty kit list under --json', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.resolve('packages/authored'));

      const { stdout } = await list(['--recursive', '--json']);
      const payload = JSON.parse(stdout);

      expect(payload).toStrictEqual({ schemaVersion: 1, kits: [] });
    });

    it('prints the empty-sweep message for a tree whose projects have nothing compiled', async ({ temp }) => {
      using _cwd = pointCwdAt(temp.resolve('packages/authored'));

      const { stdout } = await list(['--recursive']);

      expect(stdout).toContain('No kit projects found.');
    });
  });

  describe('a project the filesystem will not fully give up', () => {
    it('lists the kits beside a manifest that cannot be parsed, and warns', async () => {
      const { stdout, stderr } = await list(['--recursive']);

      expect(stdout).toContain('packages/corrupt/');
      expect(stdout).toContain('audit');
      expect(stderr).toContain('manifest');
    });

    it('names the project of a kit read from disk past a broken manifest', async () => {
      const parsed = ListOutputSchema.parse(await runForPayload());

      expect(parsed.kits).toContainEqual({
        name: 'audit',
        kind: 'compiled',
        project: 'packages/corrupt',
        path: 'packages/corrupt/.readyup/kits/audit.js',
      });
    });

    it('drops a project whose output directory it cannot read, and lists the rest', async ({ reads }) => {
      reads.failReadOf('packages/blocked/dist/kits', 'EACCES');

      const { exitCode, stdout, stderr } = await list(['--recursive']);

      expect(exitCode).toBe(0);
      expect(stdout).not.toContain('packages/blocked');
      expect(stdout).toContain('packages/readyup/');
      expect(stderr).toContain('Omitting packages/blocked from the listing');
    });

    it('rethrows a filesystem failure that is not benign', async ({ reads }) => {
      reads.failReadOf('packages/blocked/dist/kits', 'EMFILE');

      await expect(listCommand(['--recursive'])).rejects.toThrow('read failed: EMFILE');
    });
  });

  describe('flag exclusivity', () => {
    it('rejects --recursive alongside --from', async () => {
      const error = await captureError(RdyError, () => listCommand(['--recursive', '--from', '.']));

      expect(error.code).toBe('usage');
      expect(error.message).toBe('--recursive and --from are mutually exclusive');
    });

    it('rejects --recursive alongside --manifest', async () => {
      const error = await captureError(RdyError, () =>
        listCommand(['--recursive', '--manifest', '.readyup/manifest.json']),
      );

      expect(error.code).toBe('usage');
      expect(error.message).toBe('--recursive and --manifest are mutually exclusive');
    });
  });

  it('leaves a plain listing showing sections rather than project blocks', async () => {
    const { stdout } = await list([]);

    expect(stdout).toContain('\u{2500}\u{2500} Compiled');
    expect(stdout).not.toContain('\u{1F4C1}');
  });

  // region | Helpers

  /** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
  async function list(args: string[]) {
    using io = captureStdio();

    const exitCode = await listCommand(args);

    return { exitCode, stdout: io.stdout, stderr: io.stderr };
  }

  /** Runs a recursive listing under `--json` and returns the payload it emitted. */
  async function runForPayload(): Promise<unknown> {
    const { stdout } = await list(['--recursive', '--json']);
    return JSON.parse(stdout);
  }

  // endregion | Helpers
});
