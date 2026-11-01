import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { REPO_CONFIG_PATH } from '../find-repo-root.ts';
import { readRepoConfig, type RepoConfigResult } from '../read-repo-config.ts';

const HOME = '/home/demo';

describe(readRepoConfig, () => {
  it('applies every default to an empty file', () => {
    using tree = createTempTree({ [REPO_CONFIG_PATH]: '' });

    expect(readRepoConfig({ cwd: tree.dir, env: {}, homeDir: HOME })).toStrictEqual({
      ok: true,
      config: {
        aidemoEnv: {},
        configPath: path.join(tree.dir, REPO_CONFIG_PATH),
        demosDir: 'demos',
        root: tree.dir,
      },
    });
  });

  it('finds the nearest root above the working directory', () => {
    using tree = createTempTree({
      [REPO_CONFIG_PATH]: 'demosDir: outer\n',
      [`inner/${REPO_CONFIG_PATH}`]: 'demosDir: nested\n',
      'inner/deep/.keep': '',
    });

    const result = readRepoConfig({ cwd: tree.resolve('inner/deep'), env: {}, homeDir: HOME });

    expect(result.ok && result.config).toMatchObject({ demosDir: 'nested', root: tree.resolve('inner') });
  });

  it('expands the declared aidemo environment', () => {
    using tree = createTempTree({
      [REPO_CONFIG_PATH]: 'aidemo:\n  env:\n    AIDEMO_CHROME_PROFILE: ~/profile\n    AIDEMO_VOICE: ${VOICE}\n',
    });

    const result = readRepoConfig({ cwd: tree.dir, env: { VOICE: 'af_heart' }, homeDir: HOME });

    expect(result.ok && result.config.aidemoEnv).toStrictEqual({
      AIDEMO_CHROME_PROFILE: `${HOME}/profile`,
      AIDEMO_VOICE: 'af_heart',
    });
  });

  it.each([
    ['media/demos/', 'media/demos'],
    ['./demos', 'demos'],
  ])('normalizes demosDir %o', (raw, expected) => {
    using tree = createTempTree({ [REPO_CONFIG_PATH]: `demosDir: ${raw}\n` });

    const result = readRepoConfig({ cwd: tree.dir, env: {}, homeDir: HOME });

    expect(result.ok && result.config.demosDir).toBe(expected);
  });

  it('names the file to create when no root is found', () => {
    using tree = createTempTree({ 'x/.keep': '' });

    const result = readRepoConfig({ cwd: tree.resolve('x'), env: {}, homeDir: HOME });

    expect(readMessage(result)).toMatch(/\.config\/thor-demo\.yaml not found in .*; create it at the root/);
  });

  it.each([
    ['malformed YAML', 'demosDir: [\n', /cannot be read as YAML/],
    ['a document that is not a mapping', '- a\n', /must be a mapping/],
    ['an unknown top-level key', 'demoDir: demos\n', /unknown key "demoDir"/],
    ['an unknown aidemo key', 'aidemo:\n  environment: {}\n', /unknown key "aidemo\.environment"/],
    ['a non-mapping aidemo section', 'aidemo: yes\n', /aidemo must be a mapping/],
    ['a non-mapping aidemo.env', 'aidemo:\n  env: [a]\n', /aidemo\.env must be a mapping of strings/],
    ['a non-string env value', 'aidemo:\n  env:\n    PORT: 9\n', /aidemo\.env\.PORT must be a string/],
    ['an unset variable', 'aidemo:\n  env:\n    K: ${UNSET}\n', /aidemo\.env\.K: UNSET is not set/],
    ['an empty demosDir', 'demosDir: ""\n', /demosDir must be a non-empty string/],
    ['an absolute demosDir', 'demosDir: /abs\n', /demosDir must be relative/],
    ['a demosDir naming the root', 'demosDir: .\n', /demosDir must name a directory inside/],
    ['a demosDir above the root', 'demosDir: a/../../b\n', /demosDir must name a directory inside/],
  ])('reports %s', (_label, content, expected) => {
    using tree = createTempTree({ [REPO_CONFIG_PATH]: content });

    const message = readMessage(readRepoConfig({ cwd: tree.dir, env: {}, homeDir: HOME }));

    expect(message).toMatch(expected);
    expect(message.startsWith(tree.resolve(REPO_CONFIG_PATH))).toBe(true);
  });
});

// region | Helpers

/** Returns the failure message of a result, or an empty string for a success. */
function readMessage(result: RepoConfigResult): string {
  return result.ok ? '' : result.message;
}

// endregion | Helpers
