import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { AIDEMO_INSTALL_COMMAND, resolveAidemo } from '../resolve-aidemo.ts';

const MANIFEST = 'node_modules/@tandryukha/aidemo/package.json';

describe(resolveAidemo, () => {
  it('resolves a supported install to its bin', () => {
    using tree = createTempTree({
      'package.json': '{}',
      [MANIFEST]: JSON.stringify({ version: '0.20.0', bin: { aidemo: 'bin/aidemo.mjs' } }),
    });

    expect(resolveAidemo(tree.dir)).toStrictEqual({
      ok: true,
      aidemo: { bin: tree.resolve('node_modules/@tandryukha/aidemo/bin/aidemo.mjs'), version: '0.20.0' },
    });
  });

  it('accepts a bin declared as a single path and a prerelease of the minimum', () => {
    using tree = createTempTree({ [MANIFEST]: JSON.stringify({ version: '0.17.0-rc.1', bin: './cli.mjs' }) });

    const result = resolveAidemo(tree.dir);

    expect(result.ok && result.aidemo.bin).toBe(tree.resolve('node_modules/@tandryukha/aidemo/cli.mjs'));
  });

  it.each([
    ['a missing install', undefined, /is not installed in/],
    [
      'an older version',
      { version: '0.15.2', bin: { aidemo: 'bin/aidemo.mjs' } },
      /0\.15\.2 is installed .* 0\.17\.0 or later/,
    ],
    ['an unparsable version', { version: 'next', bin: { aidemo: 'bin/aidemo.mjs' } }, /does not declare a version/],
    ['a missing bin', { version: '0.20.0', bin: { other: 'x.mjs' } }, /does not declare an aidemo bin/],
  ])('refuses %s and names the install command', (_label, manifest, expected) => {
    using tree = createTempTree(
      manifest === undefined ? { 'package.json': '{}' } : { [MANIFEST]: JSON.stringify(manifest) },
    );

    const result = resolveAidemo(tree.dir);
    const message = result.ok ? '' : result.message;

    expect(message).toMatch(expected);
    expect(message.endsWith(AIDEMO_INSTALL_COMMAND)).toBe(true);
  });

  it('refuses a version older than a minimum that the caller passes', () => {
    using tree = createTempTree({
      [MANIFEST]: JSON.stringify({ version: '0.20.1', bin: { aidemo: 'bin/aidemo.mjs' } }),
    });

    const result = resolveAidemo(tree.dir, '0.20.2');

    expect(result.ok ? '' : result.message).toMatch(/0\.20\.1 is installed .* 0\.20\.2 or later/);
    expect(resolveAidemo(tree.dir).ok).toBe(true);
  });
});
