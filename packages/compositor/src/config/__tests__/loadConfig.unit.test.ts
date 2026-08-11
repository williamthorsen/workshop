import assert from 'node:assert';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig, type TierFile } from '../loadConfig.ts';
import { buildConfigDir } from '../test-utils/buildConfigDir.ts';
import { captureError } from '../test-utils/captureError.ts';

const globalTier = `
select:
  skill:
    use: [lint]
`;
const projectTier = `
sources:
  use:
    - { name: local, path: ./content }
select:
  skill:
    use: [format]
    drop: [lint]
`;

describe(loadConfig, () => {
  it('reads a chain of tier files, keeping the order it was given', async () => {
    const dir = await buildConfigDir({ 'global.yaml': globalTier, 'project.yaml': projectTier });

    const config = await loadConfig([buildTierFile(dir, 'global'), buildTierFile(dir, 'project')]);

    expect(config.tiers.map(({ id }) => id)).toStrictEqual(['global', 'project']);
  });

  it('skips a tier whose file is absent, and keeps one whose file is empty', async () => {
    const dir = await buildConfigDir({ 'global.yaml': '# every entry commented out\n' });

    const config = await loadConfig([buildTierFile(dir, 'global'), buildTierFile(dir, 'project')]);

    expect(config.tiers).toStrictEqual([
      { id: 'global', label: 'global', baseDir: dir, shouldReset: false, sources: { use: [], drop: [] }, select: [] },
    ]);
  });

  it('yields a config with no tiers when every file is absent', async () => {
    const dir = await buildConfigDir({});

    await expect(loadConfig([buildTierFile(dir, 'global'), buildTierFile(dir, 'project')])).resolves.toStrictEqual({
      tiers: [],
    });
  });

  it('takes each tier’s base directory from the file that declared it', async () => {
    const dir = await buildConfigDir({ 'nested/project.yaml': projectTier });

    const config = await loadConfig([{ id: 'project', label: 'Project', path: path.join(dir, 'nested/project.yaml') }]);

    expect(config.tiers.at(0)?.baseDir).toBe(path.join(dir, 'nested'));
  });

  it('normalizes what it reads, so the result needs no further parsing', async () => {
    const dir = await buildConfigDir({ 'project.yaml': projectTier });

    const config = await loadConfig([buildTierFile(dir, 'project')]);

    expect(config.tiers.at(0)?.sources.use).toStrictEqual([
      { name: 'local', origin: { kind: 'directory', location: './content' } },
    ]);
  });

  // YAML is a superset of JSON, so a consumer writing config as JSON needs no separate branch here.
  it('reads a tier written as JSON', async () => {
    const dir = await buildConfigDir({ 'project.json': '{ "select": { "skill": { "use": ["lint"] } } }' });

    const config = await loadConfig([{ id: 'project', label: 'Project', path: path.join(dir, 'project.json') }]);

    expect(config.tiers.at(0)?.select).toStrictEqual([{ kindId: 'skill', use: [{ artifact: 'lint' }], drop: [] }]);
  });

  it('fails on malformed YAML, naming the file', async () => {
    const dir = await buildConfigDir({ 'project.yaml': 'select: [unclosed\n' });

    await expect(loadConfig([buildTierFile(dir, 'project')])).rejects.toThrow(path.join(dir, 'project.yaml'));
  });

  it('appends the parser message to the malformed-YAML failure and keeps the original as cause', async () => {
    const dir = await buildConfigDir({ 'project.yaml': 'select: [unclosed\n' });

    const error = await captureError(() => loadConfig([buildTierFile(dir, 'project')]));

    const { cause } = error;
    assert.ok(cause instanceof Error);
    expect(error.message).toBe(`Config file "${path.join(dir, 'project.yaml')}" is not valid YAML: ${cause.message}`);
  });

  it('fails on a tier declaring an unrecognized key, naming the file', async () => {
    const dir = await buildConfigDir({ 'project.yaml': 'selects: {}\n' });

    await expect(loadConfig([buildTierFile(dir, 'project')])).rejects.toThrow(path.join(dir, 'project.yaml'));
  });

  // Both files are absent, so a check running after the load would see no tiers at all and never notice the repeat.
  it('fails on two tiers sharing an id, naming the id', async () => {
    const dir = await buildConfigDir({});

    await expect(loadConfig([buildTierFile(dir, 'project'), buildTierFile(dir, 'project')])).rejects.toThrow(
      /Tier "project" is declared more than once/,
    );
  });

  it('fails on a tier whose identity is incomplete', async () => {
    const dir = await buildConfigDir({ 'project.yaml': projectTier });

    await expect(loadConfig([{ ...buildTierFile(dir, 'project'), id: '' }])).rejects.toThrow(/id/);
  });
});

// region | Helpers

/** Builds the tier a consumer would declare for `<dir>/<name>.yaml`, using the name as its identity. */
function buildTierFile(dir: string, name: string): TierFile {
  return { id: name, label: name, path: path.join(dir, `${name}.yaml`) };
}

// endregion | Helpers
