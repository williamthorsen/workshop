import { captureError, captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockCollectSourceKitNames = vi.hoisted(() => vi.fn());
const mockEnumerateKits = vi.hoisted(() => vi.fn());
const mockReadManifest = vi.hoisted(() => vi.fn());
const mockExpandConfiguredPackages = vi.hoisted(() => vi.fn());
const mockDiscoverKitPackages = vi.hoisted(() => vi.fn());

vi.mock(import('../../installed-packages/expandConfiguredPackages.ts'), () => ({
  expandConfiguredPackages: mockExpandConfiguredPackages,
}));

vi.mock(import('../../check-utils/discoverKitPackages.ts'), () => ({
  discoverKitPackages: mockDiscoverKitPackages,
}));

vi.mock(import('../../config/loadConfig.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/loadConfig.ts')>();
  return {
    DEFAULT_CONFIG: actual.DEFAULT_CONFIG,
    loadConfig: mockLoadConfig,
  };
});

vi.mock(import('../enumerateKits.ts'), () => ({
  enumerateKits: mockEnumerateKits,
}));

vi.mock(import('../../compile/collectSourceKitNames.ts'), () => ({
  collectSourceKitNames: mockCollectSourceKitNames,
}));

vi.mock(import('../../manifest/readManifest.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../manifest/readManifest.ts')>();
  return {
    ManifestNotFoundError: actual.ManifestNotFoundError,
    readManifest: mockReadManifest,
  };
});

import { RdyError } from '../../errors/RdyError.ts';
import { ManifestNotFoundError } from '../../manifest/readManifest.ts';
import { listCommand } from '../listCommand.ts';

describe(listCommand, () => {
  beforeEach(() => {
    mockLoadConfig.mockResolvedValue({
      compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
      internal: { dir: '.', infix: undefined },
      packages: [],
    });
    mockCollectSourceKitNames.mockReturnValue([]);
    mockEnumerateKits.mockReturnValue([]);
    mockReadManifest.mockReturnValue({ version: 1, kits: [] });
    mockExpandConfiguredPackages.mockReturnValue([]);
    mockDiscoverKitPackages.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadConfig.mockReset();
    mockCollectSourceKitNames.mockReset();
    mockEnumerateKits.mockReset();
    mockReadManifest.mockReset();
    mockExpandConfiguredPackages.mockReset();
    mockDiscoverKitPackages.mockReset();
  });

  describe('owner mode, package sections', () => {
    /** Configures one package and the kit that it publishes. */
    function configureOnePackage(): void {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
        internal: { dir: '.', infix: undefined },
        packages: ['@acme/kits'],
      });
      mockExpandConfiguredPackages.mockReturnValue([
        { packageName: '@acme/kits', version: '2.1.0', kitName: 'drift', path: '/pkg/.readyup/kits/drift.js' },
      ]);
    }

    // A project with no kits of its own still runs its dependencies' kits, so reporting "no kits found"
    // and stopping would hide everything `rdy run --packages` would execute.
    it('reports package kits when the project has no manifest and no internal kits of its own', async () => {
      configureOnePackage();
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('.readyup/manifest.json');
      });

      const { exitCode, stdout } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Packages');
      expect(stdout).toContain('@acme/kits@2.1.0 / \u{1F4D3} drift');
      expect(stdout).not.toContain('No kits found');
    });

    it('nests the checklists recorded by a package kit\u{2019}s manifest beneath it', async () => {
      configureOnePackage();
      mockExpandConfiguredPackages.mockReturnValue([
        {
          packageName: '@acme/kits',
          version: '2.1.0',
          kitName: 'drift',
          checklists: ['lockfile', 'ranges'],
          path: '/pkg/.readyup/kits/drift.js',
        },
      ]);

      const { stdout } = await list([]);

      expect(stdout).toContain('@acme/kits@2.1.0 / \u{1F4D3} drift\n   \u{1F4CB} lockfile\n   \u{1F4CB} ranges');
    });

    it('names installed packages that publish kits omitted by the config', async () => {
      mockDiscoverKitPackages.mockReturnValue(['@acme/kits', 'plain-kit']);
      configureOnePackage();

      const { stdout } = await list([]);

      expect(stdout).toContain('Available');
      expect(stdout).toContain('plain-kit');
      // Already configured, so it belongs under Packages rather than as a candidate to add.
      expect(stdout.slice(stdout.indexOf('Available'))).not.toContain('@acme/kits');
    });

    it('passes package provenance into the JSON payload, apart from the kits that it lists', async () => {
      mockDiscoverKitPackages.mockReturnValue(['plain-kit']);
      configureOnePackage();

      const { stdout } = await list(['--json']);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({
        kits: [{ name: 'drift', kind: 'compiled', origin: { package: '@acme/kits', version: '2.1.0' } }],
        availablePackages: ['plain-kit'],
      });
    });

    // A package reaches the owner listing's rows only by being configured, so the marker is always true
    // here; emitting it regardless spares a consumer from knowing which invocation wrote the payload.
    it('marks every package row as configured', async () => {
      configureOnePackage();

      const { stdout } = await list(['--json']);

      const payload: unknown = JSON.parse(stdout);
      expect(payload).toMatchObject({ kits: [{ origin: { configured: true } }] });
    });
  });

  describe('owner mode', () => {
    it('loads config and reads manifest for compiled kits', async () => {
      mockCollectSourceKitNames.mockReturnValue(['default']);
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy' }],
      });

      const { exitCode, stdout } = await list([]);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).toHaveBeenCalledWith({});
      expect(mockReadManifest).toHaveBeenCalledTimes(1);
      expect(mockCollectSourceKitNames).toHaveBeenCalledWith(
        expect.stringContaining('.readyup/kits'),
        expect.objectContaining({ include: undefined, exclude: [] }),
      );
      expect(stdout).toContain('\u{2500}\u{2500} Sources');
      expect(stdout).toContain('\u{2500}\u{2500} Compiled');
    });

    it('omits the Internal section under a config that declares no internal bucket', async () => {
      mockCollectSourceKitNames.mockReturnValue(['default']);

      const { stdout } = await list([]);

      expect(stdout).not.toContain('\u{2500}\u{2500} Internal');
      expect(mockEnumerateKits).not.toHaveBeenCalled();
    });

    it('nests the checklists recorded by the manifest beneath each compiled kit', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', checklists: ['build', 'release'] }],
      });

      const { stdout } = await list([]);

      expect(stdout).toContain('\u{1F4D3} deploy\n   \u{1F4CB} build\n   \u{1F4CB} release');
    });

    it('uses infix-based extension for internal kits when configured', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
        internal: { dir: '.', infix: 'int' },
        packages: [],
      });
      mockEnumerateKits.mockReturnValue(['default']);

      const { exitCode } = await list([]);

      expect(exitCode).toBe(0);
      expect(mockEnumerateKits).toHaveBeenCalledWith(expect.objectContaining({ extension: '.int.ts' }));
    });

    it('renders only the Sources section when manifest has no compiled kits', async () => {
      mockCollectSourceKitNames.mockReturnValue(['default']);
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { exitCode, stdout } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('\u{2500}\u{2500} Sources');
      expect(stdout).not.toContain('\u{2500}\u{2500} Compiled');
    });

    it('names the kits of a relocated output directory rather than pathing them', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: 'src/kits', outDir: 'dist/kits', include: undefined, exclude: [] },
        internal: { dir: '.', infix: undefined },
        packages: [],
      });
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy' }],
      });

      const { exitCode, stdout } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('\u{2500}\u{2500} Compiled\n   To run: rdy run <kit>[:<checklist>,...]');
      expect(stdout).not.toContain('--file');
    });

    it('prints empty-owner message when no kits exist', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const { exitCode, stdout } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No kits found.');
    });

    it('warns and lists with default settings when config load fails', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config'));
      mockCollectSourceKitNames.mockReturnValue(['default']);

      const { exitCode, stdout, stderr } = await list([]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe('Warning: bad config. Listing with default settings.\n');
      expect(stdout).toContain('default');
    });

    it('renders a hint that the config failure has, on a line of its own', async () => {
      mockLoadConfig.mockRejectedValue(
        Object.assign(new Error("Cannot resolve 'some-lib' while evaluating config.ts."), {
          hint: 'Install it with: pnpm add --save-dev some-lib',
        }),
      );

      const { stderrChunks } = await list([]);

      expect(stderrChunks).toStrictEqual([
        "Warning: Cannot resolve 'some-lib' while evaluating config.ts. Listing with default settings.\n",
        '\u{1F4A1} Hint: Install it with: pnpm add --save-dev some-lib\n',
      ]);
    });

    it('writes no hint line for a config failure that has none', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config'));

      const { stderrChunks } = await list([]);

      expect(stderrChunks).toHaveLength(1);
    });

    it('does not double the period when the config failure already ends in one', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad config.'));

      const { stderr } = await list([]);

      expect(stderr).toBe('Warning: bad config. Listing with default settings.\n');
    });

    it('reports a config error when enumerateKits throws', async () => {
      const permError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
        internal: { dir: 'internal', infix: undefined },
        packages: [],
      });
      mockEnumerateKits.mockImplementation(() => {
        throw permError;
      });

      const { error } = await listRaising([]);

      expect(error.code).toBe('config');
      expect(error.message).toContain('permission denied');
    });

    it('reports a config error when the source selection throws', async () => {
      mockCollectSourceKitNames.mockImplementation(() => {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      });

      const { error } = await listRaising([]);

      expect(error.code).toBe('config');
      expect(error.message).toContain('permission denied');
    });

    it('renders Sources without Compiled when neither a manifest nor a bundle exists', async () => {
      mockCollectSourceKitNames.mockReturnValue(['default']);
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const { exitCode, stdout, stderr } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('\u{2500}\u{2500} Sources');
      expect(stdout).not.toContain('\u{2500}\u{2500} Compiled');
      expect(stderr).toBe('');
    });

    it('lists the bundles in the output directory under Compiled when there is no manifest', async () => {
      mockEnumerateKits.mockImplementation(enumerateByExtension({ '.js': ['deploy'] }));
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const { stdout } = await list(['--json']);

      expect(mockEnumerateKits).toHaveBeenCalledWith(
        expect.objectContaining({ dir: expect.stringMatching(/\.readyup\/kits$/), extension: '.js', recursive: true }),
      );
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        kits: [{ name: 'deploy', kind: 'compiled', path: '.readyup/kits/deploy.js' }],
      });
    });

    it('names a nested bundle by the kit that runs it when there is no manifest', async () => {
      mockEnumerateKits.mockImplementation(enumerateByExtension({ '.js': ['ops/deploy'] }));
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const { stdout } = await list(['--json']);

      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        kits: [{ name: 'ops/deploy', kind: 'compiled', path: '.readyup/kits/ops/deploy.js' }],
      });
    });

    it('lists the bundles on disk past a manifest that cannot be read, and warns', async () => {
      mockEnumerateKits.mockImplementation(enumerateByExtension({ '.js': ['deploy'] }));
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file contains invalid JSON: .readyup/manifest.json');
      });

      const { stdout, stderr } = await list([]);

      expect(stdout).toContain('\u{2500}\u{2500} Compiled');
      expect(stdout).toContain('deploy');
      expect(stderr).toBe('Warning: Manifest file contains invalid JSON: .readyup/manifest.json\n');
    });

    it.each([
      ['dir', { dir: 'internal', infix: undefined }],
      ['infix', { dir: '.', infix: 'internal' }],
    ])('adds --internal to the internal hint when internal.%s is configured', async (_label, internal) => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: undefined, exclude: [] },
        internal,
        packages: [],
      });
      mockEnumerateKits.mockReturnValue(['default']);

      const { stdout } = await list([]);

      expect(stdout).toContain(
        '\u{2500}\u{2500} Internal\n   To run: rdy run --jit --internal [<kit>[:<checklist>,...]]',
      );
    });

    it('heads the Sources section with the plain --jit hint', async () => {
      mockCollectSourceKitNames.mockReturnValue(['default']);

      const { stdout } = await list([]);

      expect(stdout).toContain('\u{2500}\u{2500} Sources\n   To run: rdy run --jit [<kit>[:<checklist>,...]]');
    });

    it('writes warning to stderr when manifest read fails with non-missing-file error and sources exist', async () => {
      mockCollectSourceKitNames.mockReturnValue(['default']);
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file contains invalid JSON: .readyup/manifest.json');
      });

      const { exitCode, stdout, stderr } = await list([]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('\u{2500}\u{2500} Sources');
      expect(stdout).not.toContain('\u{2500}\u{2500} Compiled');
      expect(stderr).toContain('Warning:');
      expect(stderr).toContain('invalid JSON');
    });
  });

  describe('from mode', () => {
    it('does not load config when --from is given', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { exitCode } = await list(['--from', '.']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).not.toHaveBeenCalled();
    });

    it('reads manifest from a local path and displays compiled kits', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy' }],
      });

      const { exitCode, stdout } = await list(['--from', '.']);

      expect(exitCode).toBe(0);
      expect(mockReadManifest).toHaveBeenCalledWith(expect.stringContaining('.readyup/manifest.json'));
      expect(stdout).toContain('\u{2500}\u{2500} Compiled');
      expect(stdout).toContain('deploy');
    });

    it('prints empty-consumer message when manifest contains no kits', async () => {
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { exitCode, stdout } = await list(['--from', '.']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No compiled kits found');
    });

    it('reports a config error when the manifest is not found at the --from path', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file not found: /nonexistent/.readyup/manifest.json');
      });

      const { error } = await listRaising(['--from', '/nonexistent']);

      expect(error.code).toBe('config');
      expect(error.message).toContain('Manifest file not found');
    });
  });

  describe('manifest mode', () => {
    it('displays kits from the manifest file', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'default', description: 'Health checks' }, { name: 'deploy' }],
      });

      const { exitCode, stdout } = await list(['--manifest', '.readyup/manifest.json']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).not.toHaveBeenCalled();
      expect(stdout).toContain('\u{2500}\u{2500} Manifest:');
      expect(stdout).toContain('default');
      expect(stdout).toContain('Health checks');
      expect(stdout).toContain('deploy');
    });

    it('reports a config error when the manifest file cannot be read', async () => {
      mockReadManifest.mockImplementation(() => {
        throw new Error('Manifest file not found: /missing/manifest.json');
      });

      const { error } = await listRaising(['--manifest', '/missing/manifest.json']);

      expect(error.code).toBe('config');
      expect(error.message).toContain('Manifest file not found');
    });

    it('reports a usage error when --from and --manifest are both provided', async () => {
      const { error } = await listRaising(['--from', '.', '--manifest', '.readyup/manifest.json']);

      expect(error.code).toBe('usage');
      expect(error.message).toContain('mutually exclusive');
    });
  });

  describe('--config', () => {
    it.each([
      { mode: 'owner mode', args: [] },
      { mode: 'packages mode', args: ['--packages'] },
    ])('loads the config named by --config in $mode', async ({ args }) => {
      const { exitCode } = await list([...args, '--config', 'custom/readyup.config.ts']);

      expect(exitCode).toBe(0);
      expect(mockLoadConfig).toHaveBeenCalledWith({ overridePath: 'custom/readyup.config.ts' });
    });

    it.each([
      { args: ['--from', '.'], message: '--config and --from are mutually exclusive' },
      { args: ['--manifest', '.readyup/manifest.json'], message: '--config and --manifest are mutually exclusive' },
      { args: ['--recursive'], message: '--recursive and --config are mutually exclusive' },
    ])('reports a usage error for --config with $args.0', async ({ args, message }) => {
      const { error } = await listRaising([...args, '--config', 'custom/readyup.config.ts']);

      expect(error.code).toBe('usage');
      expect(error.message).toBe(message);
    });

    it('reports a usage error when --config is given an empty value', async () => {
      const { error } = await listRaising(['--config=']);

      expect(error.code).toBe('usage');
      expect(error.message).toBe('--config requires a value');
    });
  });

  describe('--json', () => {
    it('distinguishes sources from compiled kits in owner mode', async () => {
      mockCollectSourceKitNames.mockReturnValue(['draft']);
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', path: 'kits/deploy.js', checklists: ['preflight'] }],
      });

      const { exitCode, stdout } = await list(['--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        schemaVersion: 1,
        kits: [
          { name: 'draft', kind: 'internal', internal: false, path: expect.stringContaining('draft.ts') },
          { name: 'deploy', kind: 'compiled', checklists: ['preflight'] },
        ],
      });
    });

    it('marks the internal bucket apart from the sources that share its kind', async () => {
      mockLoadConfig.mockResolvedValue({
        compile: { srcDir: '.readyup/kits', outDir: '.readyup/kits', include: ['*.ts'], exclude: [] },
        internal: { dir: 'internal', infix: undefined },
        packages: [],
      });
      mockCollectSourceKitNames.mockReturnValue(['draft']);
      mockEnumerateKits.mockReturnValue(['audit']);

      const { stdout } = await list(['--json']);

      expect(JSON.parse(stdout)).toMatchObject({
        kits: [
          { name: 'draft', kind: 'internal', internal: false },
          { name: 'audit', kind: 'internal', internal: true },
        ],
      });
    });

    it('sends the human view to stderr so stdout holds one document', async () => {
      mockCollectSourceKitNames.mockReturnValue(['draft']);
      mockReadManifest.mockReturnValue({ version: 1, kits: [] });

      const { stdoutChunks, stderr } = await list(['--json']);

      expect(stdoutChunks).toHaveLength(1);
      expect(stderr).toContain('\u{2500}\u{2500} Sources');
    });

    it('reports an empty kit list rather than the empty-owner prose', async () => {
      mockEnumerateKits.mockReturnValue([]);
      mockReadManifest.mockImplementation(() => {
        throw new ManifestNotFoundError('/fake/.readyup/manifest.json');
      });

      const { stdout, stderr } = await list(['--json']);

      expect(JSON.parse(stdout)).toStrictEqual({ schemaVersion: 1, kits: [] });
      expect(stderr).toContain('No kits found.');
    });

    it('reports the manifest fields in manifest mode', async () => {
      mockReadManifest.mockReturnValue({
        version: 1,
        kits: [{ name: 'deploy', description: 'Deploy checks', readyupVersion: '0.21.2' }],
      });

      const { stdout } = await list(['--manifest', '.readyup/manifest.json', '--json']);

      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        kits: [{ name: 'deploy', kind: 'compiled', description: 'Deploy checks', readyupVersion: '0.21.2' }],
      });
    });
  });

  it('reports a usage error for unknown flags', async () => {
    const { error } = await listRaising(['--unknown']);

    expect(error.code).toBe('usage');
    expect(error.message).toContain("Unknown option '--unknown'");
  });

  it('reports a usage error when positional arguments are supplied, before reading anything', async () => {
    const { error } = await listRaising(['deploy']);

    expect(error.code).toBe('usage');
    expect(error.message).toBe('rdy list does not accept positional arguments.');
    expect(mockLoadConfig).not.toHaveBeenCalled();
  });
});

// region | Helpers

/** Returns an `enumerateKits` stand-in that yields the names listed for each extension, and none for any other. */
function enumerateByExtension(namesByExtension: Record<string, string[]>) {
  return ({ extension }: { extension: string }): string[] => namesByExtension[extension] ?? [];
}

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
async function list(args: string[]) {
  using io = captureStdio();

  const exitCode = await listCommand(args);

  return {
    exitCode,
    stdout: io.stdout,
    stdoutChunks: io.stdoutChunks,
    stderr: io.stderr,
    stderrChunks: io.stderrChunks,
  };
}

/** Runs the command expecting it to raise, returning the error alongside everything it wrote. */
async function listRaising(args: string[]) {
  using io = captureStdio();

  const error = await captureError(RdyError, () => listCommand(args));

  return { error, stdout: io.stdout, stderr: io.stderr };
}

// endregion | Helpers
