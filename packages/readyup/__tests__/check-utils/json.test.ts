import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { hasJsonField, hasJsonFields, readJsonFile, readJsonValue } from '../../src/check-utils/json.ts';

let tempDir: string;
let cwdSpy: MockInstance;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'rdy-json-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  cwdSpy.mockRestore();
});

function writeJson(filename: string, content: unknown): void {
  writeFileSync(join(tempDir, filename), JSON.stringify(content));
}

function writeRaw(filename: string, content: string): void {
  writeFileSync(join(tempDir, filename), content);
}

describe(readJsonFile, () => {
  it('returns the parsed object from a JSON file', () => {
    writeJson('config.json', { key: 'value' });

    expect(readJsonFile('config.json')).toEqual({ key: 'value' });
  });

  it('returns undefined when the file does not exist', () => {
    expect(readJsonFile('missing.json')).toBeUndefined();
  });

  it('returns undefined when the file content is not an object', () => {
    writeJson('array.json', [1, 2, 3]);

    expect(readJsonFile('array.json')).toBeUndefined();
  });

  it('returns undefined when the file contains malformed JSON', () => {
    writeRaw('bad.json', '{ not valid json }}}');

    expect(readJsonFile('bad.json')).toBeUndefined();
  });
});

describe(readJsonValue, () => {
  it('returns a nested value from a JSON file', () => {
    writeJson('config.json', { publishConfig: { access: 'public' } });

    expect(readJsonValue('config.json', 'publishConfig', 'access')).toBe('public');
  });

  it('returns undefined when the file does not exist', () => {
    expect(readJsonValue('missing.json', 'key')).toBeUndefined();
  });

  it('returns undefined when the JSON is invalid', () => {
    writeRaw('bad.json', '{ not valid }}}');

    expect(readJsonValue('bad.json', 'key')).toBeUndefined();
  });

  it('returns undefined when a key in the path is missing', () => {
    writeJson('config.json', { a: { b: 'value' } });

    expect(readJsonValue('config.json', 'a', 'missing', 'deep')).toBeUndefined();
  });

  it('returns the full object when no keys are provided', () => {
    writeJson('config.json', { name: 'test' });

    expect(readJsonValue('config.json')).toEqual({ name: 'test' });
  });
});

describe(hasJsonField, () => {
  it('returns true when the field exists', () => {
    writeJson('data.json', { type: 'module' });

    expect(hasJsonField('data.json', 'type')).toBe(true);
  });

  it('returns false when the field does not exist', () => {
    writeJson('data.json', {});

    expect(hasJsonField('data.json', 'type')).toBe(false);
  });

  it('returns true when the field matches the expected value', () => {
    writeJson('data.json', { type: 'module' });

    expect(hasJsonField('data.json', 'type', 'module')).toBe(true);
  });

  it('returns false when the field does not match the expected value', () => {
    writeJson('data.json', { type: 'commonjs' });

    expect(hasJsonField('data.json', 'type', 'module')).toBe(false);
  });

  it('returns false when the file does not exist', () => {
    expect(hasJsonField('missing.json', 'type')).toBe(false);
  });
});

describe(hasJsonFields, () => {
  it('returns ok when all fields are present', () => {
    writeJson('data.json', { name: 'test', version: '1.0.0' });

    const result = hasJsonFields('data.json', ['name', 'version']);

    expect(result).toEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 2, count: 2 },
    });
  });

  it('returns not ok with missing fields listed', () => {
    writeJson('data.json', { name: 'test' });

    const result = hasJsonFields('data.json', ['name', 'version', 'type']);

    expect(result).toEqual({
      ok: false,
      detail: 'Missing fields: version, type',
      progress: { type: 'fraction', passedCount: 1, count: 3 },
    });
  });

  it('returns ok with zero counts when fields array is empty', () => {
    writeJson('data.json', { name: 'test' });

    const result = hasJsonFields('data.json', []);

    expect(result).toEqual({
      ok: true,
      progress: { type: 'fraction', passedCount: 0, count: 0 },
    });
  });

  it('returns not ok with all fields missing when file does not exist', () => {
    const result = hasJsonFields('missing.json', ['name', 'version']);

    expect(result).toEqual({
      ok: false,
      detail: 'Missing fields: name, version',
      progress: { type: 'fraction', passedCount: 0, count: 2 },
    });
  });
});
