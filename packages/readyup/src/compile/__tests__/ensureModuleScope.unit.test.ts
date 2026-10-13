import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { ensureModuleScope, isScopeMarker } from '../ensureModuleScope.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'readyup-test-module-scope-' })),
);

const MARKER = '{\n  "type": "module"\n}\n';

describe(ensureModuleScope, () => {
  it('writes the marker at outDir when no package.json scopes the bundle', ({ temp }) => {
    ensureModuleScope(temp.resolve('kits/nested/kit.js'), temp.resolve('kits'));

    expect(temp.read('kits/package.json')).toBe(MARKER);
    expect(temp.exists('kits/nested/package.json')).toBe(false);
  });

  it("writes the marker beside a bundle outside outDir, in the bundle's own directory", ({ temp }) => {
    ensureModuleScope(temp.resolve('elsewhere/kit.js'), temp.resolve('kits'));

    expect(temp.read('elsewhere/package.json')).toBe(MARKER);
    expect(temp.exists('kits/package.json')).toBe(false);
  });

  it('ignores a package.json above outDir, whatever its type', ({ temp }) => {
    temp.writeJson('package.json', { name: 'project', type: 'module' });

    ensureModuleScope(temp.resolve('kits/kit.js'), temp.resolve('kits'));

    expect(temp.read('kits/package.json')).toBe(MARKER);
  });

  it('leaves a package.json that declares "type": "module" untouched', ({ temp }) => {
    const original = '{"type":"module","name":"kits"}\n';
    temp.write('kits/package.json', original);

    ensureModuleScope(temp.resolve('kits/nested/kit.js'), temp.resolve('kits'));

    expect(temp.read('kits/package.json')).toBe(original);
    expect(temp.exists('kits/nested/package.json')).toBe(false);
  });

  it.for([
    { label: 'declares "type": "commonjs"', contents: '{"type":"commonjs"}\n' },
    { label: 'declares no type', contents: '{"name":"project"}\n' },
    { label: 'does not parse', contents: '{ not json\n' },
  ])('throws, naming the file, for a package.json in scope that $label', ({ contents }, { temp }) => {
    temp.write('package.json', contents);
    const manifestPath = temp.resolve('package.json');

    expect(() => ensureModuleScope(temp.resolve('kit.js'), temp.dir)).toThrow(manifestPath);
    expect(temp.read('package.json')).toBe(contents);
  });
});

describe(isScopeMarker, () => {
  it.for([
    { label: 'the marker that ensureModuleScope writes', contents: MARKER, expected: true },
    { label: 'a package.json declaring a name', contents: '{"name":"project","type":"module"}', expected: false },
    { label: 'a package.json declaring no type', contents: '{"name":"project"}', expected: false },
    { label: 'a package.json that does not parse', contents: '{ not json', expected: false },
  ])('returns $expected for $label', ({ contents, expected }, { temp }) => {
    expect(isScopeMarker(temp.write('package.json', contents))).toBe(expected);
  });
});
