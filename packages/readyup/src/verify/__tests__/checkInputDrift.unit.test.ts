import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { computeHash } from '../../check-utils/hashing.ts';
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

/** The package fixture as the compile recorded it, projected onto the one field that a kit picked. */
const RECORDED_PICK: RdyManifestInput = {
  hash: hashProjection(JSON.stringify({ version: PACKAGE_JSON.version })),
  kind: 'inline',
  path: 'package.json',
  paths: ['version'],
};

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'input-drift-test-' })),
);

describe(checkInputDrift, () => {
  it('returns ok when every recorded input still matches', ({ temp }) => {
    temp.write('kits/shared.ts', MODULE_SOURCE);
    temp.write('package.json', JSON.stringify(PACKAGE_JSON));

    expect(checkInputDrift(kitWith([RECORDED_MODULE, RECORDED_PICK]), temp.dir)).toStrictEqual({ kind: 'ok' });
  });

  it('returns unverified for an entry that predates the closure', ({ temp }) => {
    expect(checkInputDrift({ name: 'demo' }, temp.dir)).toStrictEqual({ kind: 'unverified' });
  });

  describe('a module input', () => {
    it('reports a changed module with both hashes and the file that has them', ({ temp }) => {
      temp.write('kits/shared.ts', 'export const shared = 2;\n');

      expect(checkInputDrift(kitWith([RECORDED_MODULE]), temp.dir)).toStrictEqual({
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

    it.for([12, 64])('returns ok when the record holds a %i-character hash', (length, { temp }) => {
      temp.write('kits/shared.ts', MODULE_SOURCE);
      const recorded: RdyManifestInput = { ...RECORDED_MODULE, hash: computeHash(MODULE_SOURCE).slice(0, length) };

      expect(checkInputDrift(kitWith([recorded]), temp.dir)).toStrictEqual({ kind: 'ok' });
    });

    it('reports the actual hash at the recorded length when a longer record has changed', ({ temp }) => {
      temp.write('kits/shared.ts', 'export const shared = 2;\n');
      const recorded: RdyManifestInput = { ...RECORDED_MODULE, hash: computeHash(MODULE_SOURCE) };

      expect(checkInputDrift(kitWith([recorded]), temp.dir)).toStrictEqual({
        kind: 'stale',
        failures: [
          {
            kind: 'module',
            path: 'kits/shared.ts',
            reason: 'changed',
            expected: recorded.hash,
            actual: computeHash('export const shared = 2;\n'),
          },
        ],
      });
    });

    it('reports a module read by the compile that is no longer on disk', ({ temp }) => {
      expect(checkInputDrift(kitWith([RECORDED_MODULE]), temp.dir)).toStrictEqual({
        kind: 'stale',
        failures: [{ kind: 'module', path: 'kits/shared.ts', reason: 'missing' }],
      });
    });
  });

  describe('an inline input', () => {
    it('reports a projection whose picked field has changed', ({ temp }) => {
      temp.write('package.json', JSON.stringify({ ...PACKAGE_JSON, version: '4.0.0' }));

      expect(checkInputDrift(kitWith([RECORDED_PICK]), temp.dir)).toStrictEqual({
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

    it.for([12, 64])('returns ok when the record holds a %i-character projection hash', (length, { temp }) => {
      temp.write('package.json', JSON.stringify(PACKAGE_JSON));
      const projection = JSON.stringify({ version: PACKAGE_JSON.version });
      const recorded: RdyManifestInput = { ...RECORDED_PICK, hash: computeHash(projection).slice(0, length) };

      expect(checkInputDrift(kitWith([recorded]), temp.dir)).toStrictEqual({ kind: 'ok' });
    });

    it('leaves an edit to a field that the kit did not pick as ok', ({ temp }) => {
      temp.write('package.json', JSON.stringify({ ...PACKAGE_JSON, name: 'renamed' }));

      expect(checkInputDrift(kitWith([RECORDED_PICK]), temp.dir)).toStrictEqual({ kind: 'ok' });
    });

    it('reports a vanished picked field apart from a hash that moved', ({ temp }) => {
      temp.write('package.json', JSON.stringify({ name: 'demo' }));

      expect(checkInputDrift(kitWith([RECORDED_PICK]), temp.dir)).toStrictEqual({
        kind: 'stale',
        failures: [
          { kind: 'inline', path: 'package.json', reason: 'unprojectable', detail: 'path not found: version' },
        ],
      });
    });

    it('reports a file that is no longer valid JSON without repeating its path', ({ temp }) => {
      temp.write('package.json', '{ not json');

      expect(checkInputDrift(kitWith([RECORDED_PICK]), temp.dir)).toStrictEqual({
        kind: 'stale',
        failures: [{ kind: 'inline', path: 'package.json', reason: 'unprojectable', detail: 'invalid JSON' }],
      });
    });

    it('reports a file whose root is no longer an object', ({ temp }) => {
      temp.write('package.json', '42');

      expect(checkInputDrift(kitWith([RECORDED_PICK]), temp.dir)).toStrictEqual({
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

    it('reports a file that is present but cannot be read', ({ temp }) => {
      temp.mkdir('package.json');

      expect(checkInputDrift(kitWith([RECORDED_PICK]), temp.dir)).toStrictEqual({
        kind: 'stale',
        failures: [{ kind: 'inline', path: 'package.json', reason: 'unprojectable', detail: 'unreadable' }],
      });
    });

    it('reports a projected file that is no longer on disk', ({ temp }) => {
      expect(checkInputDrift(kitWith([RECORDED_PICK]), temp.dir)).toStrictEqual({
        kind: 'stale',
        failures: [{ kind: 'inline', path: 'package.json', reason: 'missing' }],
      });
    });
  });

  it('reports every input that failed, so one pass names everything to fix', ({ temp }) => {
    temp.write('kits/shared.ts', 'export const shared = 2;\n');
    temp.write('package.json', JSON.stringify({ ...PACKAGE_JSON, version: '4.0.0' }));

    const status = checkInputDrift(kitWith([RECORDED_MODULE, RECORDED_PICK]), temp.dir);

    expect(status.kind === 'stale' && status.failures.map((failure) => failure.path)).toStrictEqual([
      'kits/shared.ts',
      'package.json',
    ]);
  });

  it('resolves each recorded path against the manifest directory', ({ temp }) => {
    const manifestDir = temp.mkdir('.readyup');
    temp.write('kits/shared.ts', MODULE_SOURCE);

    const status = checkInputDrift(kitWith([{ ...RECORDED_MODULE, path: '../kits/shared.ts' }]), manifestDir);

    expect(status).toStrictEqual({ kind: 'ok' });
  });

  // region | Helpers

  /** Returns a manifest entry recording the given closure and nothing else this axis reads. */
  function kitWith(inputs: RdyManifestInput[]): RdyManifestKit {
    return { inputs, name: 'demo' };
  }

  // endregion | Helpers
});
