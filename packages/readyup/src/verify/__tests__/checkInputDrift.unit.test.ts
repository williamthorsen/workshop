import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RdyManifestInput, RdyManifestKit } from '../../manifest/manifestSchema.ts';
import { checkInputDrift } from '../checkInputDrift.ts';
import { hashBytes, hashProjection } from '../targetHash.ts';

const MODULE_SOURCE = 'export const shared = 1;\n';
const PACKAGE_JSON = { name: 'demo', private: true, version: '3.1.0' };

/** The module fixture as the compile recorded it. */
const RECORDED_MODULE: RdyManifestInput = {
  hash: hashBytes(Buffer.from(MODULE_SOURCE)),
  kind: 'module',
  path: 'kits/shared.ts',
};

/** The package fixture as the compile recorded it, projected onto the one field a kit picked. */
const RECORDED_PICK: RdyManifestInput = {
  hash: hashProjection(JSON.stringify({ version: PACKAGE_JSON.version })),
  kind: 'inline',
  path: 'package.json',
  paths: ['version'],
};

describe(checkInputDrift, () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'input-drift-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns ok when every recorded input still matches', () => {
    writeInput('kits/shared.ts', MODULE_SOURCE);
    writeInput('package.json', JSON.stringify(PACKAGE_JSON));

    expect(checkInputDrift(kitWith([RECORDED_MODULE, RECORDED_PICK]), tempDir)).toStrictEqual({ kind: 'ok' });
  });

  it('returns unverified for an entry that predates the closure', () => {
    expect(checkInputDrift({ name: 'demo' }, tempDir)).toStrictEqual({ kind: 'unverified' });
  });

  describe('a module input', () => {
    it('reports a changed module with both hashes and the file that carries them', () => {
      writeInput('kits/shared.ts', 'export const shared = 2;\n');

      expect(checkInputDrift(kitWith([RECORDED_MODULE]), tempDir)).toStrictEqual({
        kind: 'stale',
        failures: [
          {
            kind: 'module',
            path: 'kits/shared.ts',
            reason: 'changed',
            expected: RECORDED_MODULE.hash,
            actual: hashBytes(Buffer.from('export const shared = 2;\n')),
          },
        ],
      });
    });

    it('reports a module the compile read that is no longer on disk', () => {
      expect(checkInputDrift(kitWith([RECORDED_MODULE]), tempDir)).toStrictEqual({
        kind: 'stale',
        failures: [{ kind: 'module', path: 'kits/shared.ts', reason: 'missing' }],
      });
    });
  });

  describe('an inline input', () => {
    it('reports a projection whose picked field has changed', () => {
      writeInput('package.json', JSON.stringify({ ...PACKAGE_JSON, version: '4.0.0' }));

      expect(checkInputDrift(kitWith([RECORDED_PICK]), tempDir)).toStrictEqual({
        kind: 'stale',
        failures: [
          {
            kind: 'inline',
            path: 'package.json',
            reason: 'changed',
            expected: RECORDED_PICK.hash,
            actual: hashProjection(JSON.stringify({ version: '4.0.0' })),
          },
        ],
      });
    });

    it('leaves an edit to a field the kit did not pick as ok', () => {
      writeInput('package.json', JSON.stringify({ ...PACKAGE_JSON, name: 'renamed' }));

      expect(checkInputDrift(kitWith([RECORDED_PICK]), tempDir)).toStrictEqual({ kind: 'ok' });
    });

    it('reports a vanished picked field apart from a hash that moved', () => {
      writeInput('package.json', JSON.stringify({ name: 'demo' }));

      expect(checkInputDrift(kitWith([RECORDED_PICK]), tempDir)).toStrictEqual({
        kind: 'stale',
        failures: [
          { kind: 'inline', path: 'package.json', reason: 'unprojectable', detail: 'Path not found in JSON: version' },
        ],
      });
    });

    it('reports a file that is no longer valid JSON without repeating its path', () => {
      writeInput('package.json', '{ not json');

      expect(checkInputDrift(kitWith([RECORDED_PICK]), tempDir)).toStrictEqual({
        kind: 'stale',
        failures: [{ kind: 'inline', path: 'package.json', reason: 'unprojectable', detail: 'invalid JSON' }],
      });
    });

    it('reports a file whose root is no longer an object', () => {
      writeInput('package.json', '42');

      expect(checkInputDrift(kitWith([RECORDED_PICK]), tempDir)).toStrictEqual({
        kind: 'stale',
        failures: [
          {
            kind: 'inline',
            path: 'package.json',
            reason: 'unprojectable',
            detail: 'expected a JSON object, got number',
          },
        ],
      });
    });

    it('reports a projected file that is no longer on disk', () => {
      expect(checkInputDrift(kitWith([RECORDED_PICK]), tempDir)).toStrictEqual({
        kind: 'stale',
        failures: [{ kind: 'inline', path: 'package.json', reason: 'missing' }],
      });
    });
  });

  it('reports every input that failed, so one pass names everything to fix', () => {
    writeInput('kits/shared.ts', 'export const shared = 2;\n');
    writeInput('package.json', JSON.stringify({ ...PACKAGE_JSON, version: '4.0.0' }));

    const status = checkInputDrift(kitWith([RECORDED_MODULE, RECORDED_PICK]), tempDir);

    expect(status.kind === 'stale' && status.failures.map((failure) => failure.path)).toStrictEqual([
      'kits/shared.ts',
      'package.json',
    ]);
  });

  it('resolves each recorded path against the manifest directory', () => {
    const manifestDir = path.join(tempDir, '.readyup');
    mkdirSync(manifestDir, { recursive: true });
    writeInput('kits/shared.ts', MODULE_SOURCE);

    const status = checkInputDrift(kitWith([{ ...RECORDED_MODULE, path: '../kits/shared.ts' }]), manifestDir);

    expect(status).toStrictEqual({ kind: 'ok' });
  });

  // region | Helpers

  /** A manifest entry recording the given closure and nothing else this axis reads. */
  function kitWith(inputs: RdyManifestInput[]): RdyManifestKit {
    return { inputs, name: 'demo' };
  }

  /** Writes a fixture under the temp directory, creating any parent directories. */
  function writeInput(relPath: string, contents: string): void {
    const filePath = path.join(tempDir, relPath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }

  // endregion | Helpers
});
