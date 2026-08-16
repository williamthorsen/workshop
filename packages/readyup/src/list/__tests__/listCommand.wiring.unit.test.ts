import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RdyError } from '../../errors/RdyError.ts';
import { ListOutputSchema } from '../../schemas/listOutputSchema.ts';
import { listCommand } from '../listCommand.ts';

/**
 * Exercises `listCommand` against real directories, without mocking the manifest reader or the
 * filesystem enumerator. The unit tests cover each mode's branches; this locks in the wiring the
 * manifest-less fallback depends on — that `list --from` looks where `run --from` loads.
 */
describe('listCommand wiring', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'list-integ-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  /** Create a kit directory holding compiled kits, with no manifest beside them. */
  function writeKitsDir(dirName: string, kitNames: string[]): string {
    const dir = path.join(tempDir, dirName);
    mkdirSync(dir, { recursive: true });
    for (const name of kitNames) {
      writeFileSync(path.join(dir, `${name}.js`), 'export default { checklists: [] };\n');
    }
    return dir;
  }

  describe('--from fallback when no manifest is present', () => {
    it('lists the compiled kits on disk in human mode', async () => {
      writeKitsDir('kits', ['alpha', 'beta']);

      const { exitCode, stdout } = await list(['--from', 'dir:kits']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('alpha');
      expect(stdout).toContain('beta');
    });

    it('lists them in JSON mode with a name and a path and nothing the manifest would have added', async () => {
      writeKitsDir('kits', ['alpha']);

      const { exitCode, stdout } = await list(['--from', 'dir:kits', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        kits: [{ name: 'alpha', kind: 'compiled', path: path.join('kits', 'alpha.js') }],
      });
    });

    it('resolves a local repo path to the same directory run --from would load from', async () => {
      writeKitsDir(path.join('repo', '.readyup', 'kits'), ['deploy']);

      const { stdout } = await list(['--from', 'repo', '--json']);

      expect(JSON.parse(stdout)).toMatchObject({
        kits: [{ name: 'deploy', path: path.join('repo', '.readyup', 'kits', 'deploy.js') }],
      });
    });

    it('ignores files that are not compiled kits', async () => {
      const dir = writeKitsDir('kits', ['alpha']);
      writeFileSync(path.join(dir, 'notes.md'), '# not a kit\n');
      writeFileSync(path.join(dir, 'alpha.ts'), 'export default {};\n');

      const { stdout } = await list(['--from', 'dir:kits', '--json']);

      expect(JSON.parse(stdout)).toMatchObject({ kits: [{ name: 'alpha' }] });
    });

    it('reports a source with neither a manifest nor a kit directory as a config error', async () => {
      const error = await captureError(RdyError, () => listCommand(['--from', 'dir:absent']));

      expect(error.code).toBe('config');
      expect(error.message).toContain('no kit directory');
    });
  });

  describe('--from with a manifest present', () => {
    it('prefers the manifest and carries the fields only it knows', async () => {
      writeKitsDir('kits', ['deploy']);
      writeFileSync(
        path.join(tempDir, 'kits', 'manifest.json'),
        JSON.stringify({
          version: 1,
          kits: [
            {
              name: 'deploy',
              path: 'deploy.js',
              checklists: ['preflight', 'release'],
              description: 'Deploy checks',
              readyupVersion: '0.21.2',
            },
          ],
        }),
      );

      const { stdout } = await list(['--from', 'dir:kits', '--json']);

      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        kits: [
          {
            name: 'deploy',
            kind: 'compiled',
            path: path.join('kits', 'deploy.js'),
            checklists: ['preflight', 'release'],
            description: 'Deploy checks',
            readyupVersion: '0.21.2',
          },
        ],
      });
    });
  });

  describe('stdout purity', () => {
    it('emits exactly one JSON document and sends the human view to stderr', async () => {
      writeKitsDir('kits', ['alpha']);

      const { stdout, stdoutChunks, stderr } = await list(['--from', 'dir:kits', '--json']);

      expect(stdoutChunks).toHaveLength(1);
      expect(stderr).toContain('alpha');
      expect(() => ListOutputSchema.parse(JSON.parse(stdout))).not.toThrow();
    });
  });
});

// region | Helpers

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
async function list(args: string[]) {
  using io = captureStdio();

  const exitCode = await listCommand(args);

  return { exitCode, stdout: io.stdout, stdoutChunks: io.stdoutChunks, stderr: io.stderr };
}

// endregion | Helpers
