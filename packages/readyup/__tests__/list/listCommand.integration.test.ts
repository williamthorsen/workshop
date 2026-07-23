import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { listCommand } from '../../src/list/listCommand.ts';
import { ListOutputSchema } from '../../src/schemas/index.ts';
import { captureRdyError } from '../helpers/captureRdyError.ts';

/**
 * Integration test: exercises `listCommand` against real directories, without mocking the manifest
 * reader or the filesystem enumerator. The unit tests cover each mode's branches; this locks in the
 * wiring the manifest-less fallback depends on — that `list --from` looks where `run --from` loads.
 */
describe('listCommand (integration)', () => {
  let tempDir: string;
  let stdout: string[];
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'list-integ-'));
    stdout = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
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

      const exitCode = await listCommand(['--from', 'dir:kits']);

      expect(exitCode).toBe(0);
      expect(stdout.join('')).toContain('alpha');
      expect(stdout.join('')).toContain('beta');
    });

    it('lists them in JSON mode with a name and a path and nothing the manifest would have added', async () => {
      writeKitsDir('kits', ['alpha']);

      const exitCode = await listCommand(['--from', 'dir:kits', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout.join(''))).toStrictEqual({
        schemaVersion: 1,
        kits: [{ name: 'alpha', kind: 'compiled', path: path.join('kits', 'alpha.js') }],
      });
    });

    it('resolves a local repo path to the same directory run --from would load from', async () => {
      writeKitsDir(path.join('repo', '.readyup', 'kits'), ['deploy']);

      await listCommand(['--from', 'repo', '--json']);

      expect(JSON.parse(stdout.join(''))).toMatchObject({
        kits: [{ name: 'deploy', path: path.join('repo', '.readyup', 'kits', 'deploy.js') }],
      });
    });

    it('ignores files that are not compiled kits', async () => {
      const dir = writeKitsDir('kits', ['alpha']);
      writeFileSync(path.join(dir, 'notes.md'), '# not a kit\n');
      writeFileSync(path.join(dir, 'alpha.ts'), 'export default {};\n');

      await listCommand(['--from', 'dir:kits', '--json']);

      expect(JSON.parse(stdout.join(''))).toMatchObject({ kits: [{ name: 'alpha' }] });
    });

    it('reports a source with neither a manifest nor a kit directory as a config error', async () => {
      const error = await captureRdyError(() => listCommand(['--from', 'dir:absent']));

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

      await listCommand(['--from', 'dir:kits', '--json']);

      expect(JSON.parse(stdout.join(''))).toStrictEqual({
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

      await listCommand(['--from', 'dir:kits', '--json']);

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('alpha'));
      expect(() => ListOutputSchema.parse(JSON.parse(stdout.join('')))).not.toThrow();
    });
  });
});
