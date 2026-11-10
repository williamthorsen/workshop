import { describe, expect, it, vi } from 'vitest';

import { inlinePickJsonCalls, type ReadJsonProjection } from '../inlinePickJsonCalls.ts';
import { JsonProjectionError } from '../JsonProjectionError.ts';

const KIT_PATH = '/project/src/kit.ts';

describe(inlinePickJsonCalls, () => {
  it('returns the source unchanged when it does not contain pickJson', () => {
    const readProjection = vi.fn<ReadJsonProjection>();

    expect(inlinePickJsonCalls('const x = 1;', KIT_PATH, readProjection)).toBe('const x = 1;');
    expect(readProjection).not.toHaveBeenCalled();
  });

  it('returns the source unchanged when pickJson appears only in a comment', () => {
    const source = '// pickJson is handled at compile time\nconst x = 1;';

    expect(inlinePickJsonCalls(source, KIT_PATH, vi.fn<ReadJsonProjection>())).toBe(source);
  });

  it('replaces a pickJson call with the projection that the reader returns', () => {
    const readProjection = vi.fn<ReadJsonProjection>(() => '{"name":"my-pkg"}');

    const result = inlinePickJsonCalls(`const meta = pickJson('./package.json', ['name']);`, KIT_PATH, readProjection);

    expect(result).toBe('const meta = {"name":"my-pkg"};');
    expect(readProjection).toHaveBeenCalledWith('/project/src/package.json', ['name']);
  });

  it('replaces multiple pickJson calls in a single file', () => {
    const readProjection = vi.fn<ReadJsonProjection>((filePath) =>
      filePath.endsWith('a.json') ? '{"x":1}' : '{"y":2}',
    );
    const source = [`const a = pickJson('./a.json', ['x']);`, `const b = pickJson('./b.json', ['y']);`].join('\n');

    expect(inlinePickJsonCalls(source, KIT_PATH, readProjection)).toBe('const a = {"x":1};\nconst b = {"y":2};');
  });

  it('passes nested path specifiers through to the reader', () => {
    const readProjection = vi.fn<ReadJsonProjection>(() => '{}');

    inlinePickJsonCalls(`pickJson("./data.json", [["config", "debug"], 'name'])`, KIT_PATH, readProjection);

    expect(readProjection).toHaveBeenCalledWith('/project/src/data.json', [['config', 'debug'], 'name']);
  });

  it('resolves the JSON path relative to the file containing the call', () => {
    const readProjection = vi.fn<ReadJsonProjection>(() => '{}');

    inlinePickJsonCalls(`pickJson('../data.json', ['name'])`, KIT_PATH, readProjection);

    expect(readProjection).toHaveBeenCalledWith('/project/data.json', ['name']);
  });

  it('throws when pickJson arguments cannot be parsed', () => {
    expect(() => inlinePickJsonCalls(`pickJson(someVar, ['name'])`, KIT_PATH, vi.fn<ReadJsonProjection>())).toThrow(
      'Cannot parse pickJson arguments',
    );
  });

  it('throws when a path element is neither a string nor a string array', () => {
    expect(() => inlinePickJsonCalls(`pickJson('./data.json', [42])`, KIT_PATH, vi.fn<ReadJsonProjection>())).toThrow(
      'Invalid path in pickJson paths array',
    );
  });

  it.each([
    ['unreadable', 'pickJson: Cannot read JSON file "./data.json" (resolved to /project/src/data.json)'],
    ['invalid-json', 'pickJson: Invalid JSON in "./data.json" (resolved to /project/src/data.json)'],
    ['not-an-object', 'pickJson: Expected a JSON object in "./data.json", got array'],
  ] as const)('names the path as written when the projection fails as %s', (reason, message) => {
    const readProjection = throwingReader(
      new JsonProjectionError(reason, '/project/src/data.json', 'x', { detail: 'array' }),
    );

    expect(() => inlinePickJsonCalls(`pickJson('./data.json', ['name'])`, KIT_PATH, readProjection)).toThrow(message);
  });

  it('rethrows a missing path as the projection reported it', () => {
    const failure = new JsonProjectionError(
      'path-not-found',
      '/project/src/data.json',
      'Path not found in JSON: missing',
    );

    expect(() =>
      inlinePickJsonCalls(`pickJson('./data.json', ['missing'])`, KIT_PATH, throwingReader(failure)),
    ).toThrow(failure);
  });
});

// region | Helpers

/** Returns a projection reader that throws `error`. */
function throwingReader(error: Error): ReadJsonProjection {
  return () => {
    throw error;
  };
}

// endregion | Helpers
