import path from 'node:path';

import {
  captureError,
  captureStdio,
  createTempTree,
  pointCwdAt,
  type TempTree,
} from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, it as baseIt, vi } from 'vitest';

import { RdyError } from '../../errors/RdyError.ts';
import { ListOutputSchema } from '../../schemas/listOutputSchema.ts';
import { listCommand } from '../listCommand.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'list-integ-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runTest();
});

/**
 * Exercises `listCommand` against real directories, without mocking the manifest reader or the
 * filesystem enumerator. The unit tests cover each mode's branches; this locks in the wiring on which
 * the manifest-less fallback depends -- that `list --from` looks where `run --from` loads.
 */
describe('listCommand wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--from fallback when no manifest is present', () => {
    it('lists the compiled kits on disk in human mode', async ({ temp }) => {
      writeKitsDir(temp, 'kits', ['alpha', 'beta']);

      const { exitCode, stdout } = await list(['--from', 'dir:kits']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('alpha');
      expect(stdout).toContain('beta');
    });

    it('lists them in JSON mode with a name and a path and nothing the manifest would have added', async ({ temp }) => {
      writeKitsDir(temp, 'kits', ['alpha']);

      const { exitCode, stdout } = await list(['--from', 'dir:kits', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        kits: [{ name: 'alpha', kind: 'compiled', path: path.join('kits', 'alpha.js') }],
      });
    });

    it('resolves a local repo path to the same directory that run --from would load from', async ({ temp }) => {
      writeKitsDir(temp, path.join('repo', '.readyup', 'kits'), ['deploy']);

      const { stdout } = await list(['--from', 'repo', '--json']);

      expect(JSON.parse(stdout)).toMatchObject({
        kits: [{ name: 'deploy', path: path.join('repo', '.readyup', 'kits', 'deploy.js') }],
      });
    });

    it('ignores files that are not compiled kits', async ({ temp }) => {
      writeKitsDir(temp, 'kits', ['alpha']);
      temp.write('kits/notes.md', '# not a kit\n');
      temp.write('kits/alpha.ts', 'export default {};\n');

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
    it('prefers the manifest and reports the fields that only it knows', async ({ temp }) => {
      writeKitsDir(temp, 'kits', ['deploy']);
      temp.writeJson('kits/manifest.json', {
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
      });

      const { stdout, stderr } = await list(['--from', 'dir:kits', '--json']);

      expect(stderr).toContain('\u{1F4D3} deploy\n   \u{1F4CB} preflight\n   \u{1F4CB} release');
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
    it('emits exactly one JSON document and sends the human view to stderr', async ({ temp }) => {
      writeKitsDir(temp, 'kits', ['alpha']);

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

/** Creates a kit directory containing compiled kits, with no manifest beside them. */
function writeKitsDir(tree: TempTree, dirName: string, kitNames: string[]): void {
  for (const name of kitNames) {
    tree.write(path.join(dirName, `${name}.js`), 'export default { checklists: [] };\n');
  }
}

// endregion | Helpers
