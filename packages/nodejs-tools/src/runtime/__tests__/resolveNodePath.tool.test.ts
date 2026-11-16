import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeProgram } from '../../test-utils/installFakeProgram.ts';
import { resolveNodePath } from '../resolveNodePath.ts';

describe(resolveNodePath, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the real path of the node that asdf names, asking from the checkout', () => {
    using tree = createTempTree({ 'checkout/.tool-versions': 'nodejs 24.0.0\n', 'installs/node': '' });
    fs.symlinkSync(tree.resolve('installs/node'), tree.resolve('shim-target'));
    // The script answers only from a directory holding `.tool-versions`, so a result shows that it ran in the checkout.
    installFakeProgram(tree, 'asdf', `[ -f .tool-versions ] || exit 1\necho "${tree.resolve('shim-target')}"\n`);

    expect(resolveNodePath(tree.resolve('checkout'))).toBe(fs.realpathSync(tree.resolve('installs/node')));
  });

  it('falls back to the running node when asdf exits non-zero', () => {
    using tree = createTempTree({ 'checkout/.keep': '' });
    installFakeProgram(tree, 'asdf', 'exit 1\n');

    expect(resolveNodePath(tree.resolve('checkout'))).toBe(fs.realpathSync(process.execPath));
  });

  it('falls back to the running node when asdf prints nothing', () => {
    using tree = createTempTree({ 'checkout/.keep': '' });
    installFakeProgram(tree, 'asdf', 'echo\n');

    expect(resolveNodePath(tree.resolve('checkout'))).toBe(fs.realpathSync(process.execPath));
  });

  it('falls back to the running node when asdf is not on PATH', () => {
    using tree = createTempTree({ 'checkout/.keep': '', 'empty/.keep': '' });
    vi.stubEnv('PATH', tree.resolve('empty'));

    expect(resolveNodePath(tree.resolve('checkout'))).toBe(fs.realpathSync(process.execPath));
  });

  it('throws when the path that asdf names does not exist', () => {
    using tree = createTempTree({ 'checkout/.keep': '' });
    installFakeProgram(tree, 'asdf', `echo "${tree.resolve('missing/node')}"\n`);

    expect(() => resolveNodePath(tree.resolve('checkout'))).toThrow(/ENOENT/);
  });
});
