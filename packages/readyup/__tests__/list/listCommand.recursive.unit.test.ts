import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { setStyle } from '../../src/layout/engine.ts';
import { listCommand } from '../../src/list/listCommand.ts';
import { ListOutputSchema } from '../../src/schemas/index.ts';
import { captureRdyError } from '../../src/test-utils/captureRdyError.ts';
import { useTempDir } from '../helpers/tempDir.ts';

const tempDir = useTempDir({
  prefix: 'rdy-recursive-',
  cwd: 'mock',
  setup: () => {
    // Sweep root, holding one kit of its own.
    tempDir.writeJson('package.json', { name: 'root' });
    tempDir.write('.readyup/kits/demo.js', 'export default {};');
    tempDir.writeJson('.readyup/manifest.json', {
      version: 1,
      kits: [{ name: 'demo', path: 'kits/demo.js' }],
    });

    // Two kits with descriptions, on the convention output directory.
    tempDir.writeJson('packages/readyup/package.json', { name: 'readyup' });
    tempDir.write('packages/readyup/.readyup/kits/default.js', 'export default {};');
    tempDir.write('packages/readyup/.readyup/kits/publishing.js', 'export default {};');
    tempDir.writeJson('packages/readyup/.readyup/manifest.json', {
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
    });

    // A relocated output directory, compiled with no manifest beside its kits.
    tempDir.writeJson('packages/tooling/package.json', { name: 'tooling' });
    tempDir.write(
      'packages/tooling/.config/readyup.config.ts',
      "export default { compile: { srcDir: 'kit-sources', outDir: 'dist/kits' } };",
    );
    tempDir.write('packages/tooling/dist/kits/lint.js', 'export default {};');

    // One kit, no description recorded for it.
    tempDir.writeJson('packages/ui/package.json', { name: 'ui' });
    tempDir.write('packages/ui/.readyup/kits/default.js', 'export default {};');
    tempDir.writeJson('packages/ui/.readyup/manifest.json', {
      version: 1,
      kits: [{ name: 'default', path: 'kits/default.js' }],
    });

    // Discovered for its sources, with nothing compiled to show.
    tempDir.writeJson('packages/authored/package.json', { name: 'authored' });
    tempDir.write('packages/authored/.readyup/kits/default.ts', 'export default {};');

    // Discovered for its manifest, which now lists nothing.
    tempDir.writeJson('packages/emptied/package.json', { name: 'emptied' });
    tempDir.writeJson('packages/emptied/.readyup/manifest.json', { version: 1, kits: [] });
  },
});

describe('list --recursive', () => {
  let stdoutSpy: MockInstance;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setStyle('rich');
  });

  /** Returns everything the run wrote to stdout. */
  function readOutput(): string {
    return stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
  }

  /** Runs a recursive listing under `--json` and returns the payload it emitted. */
  async function runForPayload(): Promise<unknown> {
    await listCommand(['--recursive', '--json']);
    return JSON.parse(String(stdoutSpy.mock.calls.at(-1)?.[0]));
  }

  describe('rendering', () => {
    it('groups kits under the project holding them, the sweep root first', async () => {
      const exitCode = await listCommand(['--recursive']);
      const output = readOutput();

      expect(exitCode).toBe(0);
      expect(output).toContain('\u{2501}\u{2501} \u{1F4C1} ./');
      expect(output).toContain('\u{2501}\u{2501} \u{1F4C1} packages/readyup/');
      expect(output.indexOf('./')).toBeLessThan(output.indexOf('packages/readyup/'));
    });

    it('names a command that runs each project\u{2019}s kits from the sweep root', async () => {
      await listCommand(['--recursive']);
      const output = readOutput();

      expect(output).toContain('rdy run <name>');
      expect(output).toContain('rdy run --from packages/readyup [<name>]');
    });

    it('carries the descriptions the manifest records, and renders a bare name without one', async () => {
      await listCommand(['--recursive']);
      const output = readOutput();

      expect(output).toContain('\u{1F4D3} default \u{00B7} Authoring hygiene for a project that defines readyup kits');
      expect(output).toContain('\u{1F4D3} demo');
      expect(output).not.toContain('demo \u{00B7}');
    });

    it('reaches a project on a relocated output directory by file path', async () => {
      await listCommand(['--recursive']);
      const output = readOutput();

      expect(output).toContain('rdy run --file <file path>');
      expect(output).toContain('\u{1F4D3} packages/tooling/dist/kits/lint.js');
    });

    it('omits a project with nothing compiled to show', async () => {
      await listCommand(['--recursive']);
      const output = readOutput();

      expect(output).not.toContain('packages/authored');
      expect(output).not.toContain('packages/emptied');
    });

    // `--style` is consumed by the router before dispatch, so the style is bound here as the router binds it.
    it('degrades to ASCII in plain style', async () => {
      setStyle('plain');

      await listCommand(['--recursive']);
      const output = readOutput();

      expect(output).toContain('== packages/readyup/');
      expect(output).not.toContain('\u{1F4C1}');
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
    it('emits an empty kit list under --json', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(`${tempDir.dir}/packages/authored`);

      await listCommand(['--recursive', '--json']);
      const payload = JSON.parse(String(stdoutSpy.mock.calls.at(-1)?.[0]));

      expect(payload).toStrictEqual({ schemaVersion: 1, kits: [] });
    });

    it('prints the empty-sweep message for a tree whose projects have nothing compiled', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(`${tempDir.dir}/packages/authored`);

      await listCommand(['--recursive']);

      expect(readOutput()).toContain('No kit projects found.');
    });
  });

  describe('flag exclusivity', () => {
    it('rejects --recursive alongside --from', async () => {
      const error = await captureRdyError(() => listCommand(['--recursive', '--from', '.']));

      expect(error.code).toBe('usage');
      expect(error.message).toBe('--recursive and --from are mutually exclusive');
    });

    it('rejects --recursive alongside --manifest', async () => {
      const error = await captureRdyError(() => listCommand(['--recursive', '--manifest', '.readyup/manifest.json']));

      expect(error.code).toBe('usage');
      expect(error.message).toBe('--recursive and --manifest are mutually exclusive');
    });
  });

  // The flag adds a mode rather than changing one, so the working directory's own listing is untouched.
  it('leaves a plain listing showing sections rather than project blocks', async () => {
    await listCommand([]);
    const output = readOutput();

    expect(output).toContain('\u{2500}\u{2500} Compiled');
    expect(output).not.toContain('\u{1F4C1}');
  });
});
