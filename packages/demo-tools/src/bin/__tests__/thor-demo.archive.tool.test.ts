import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { isRecord } from '../../portable/is-record.ts';
import { commitAll } from '../../test-utils/scratch-git-repo.ts';
import { createDemoRepo } from '../test-utils/create-demo-repo.ts';
import { runThorDemo } from '../test-utils/run-thor-demo.ts';

const OUTPUT_FILES = {
  'final-demo.mp4': 'video bytes',
  'final-demo.srt': 'srt',
  'final-demo.vtt': 'vtt',
  'report.json': '{"warnings":[]}',
};

describe('thor-demo render archiving', () => {
  it('archives a successful take with a provenance record of the commit captured before the render', () => {
    using repo = createDemoRepo({ config: 'archive:\n  label: product\n', outputFiles: OUTPUT_FILES });
    const commit = commitAll(repo.tree.dir);
    using archive = createTempTree({ '.keep': '' });

    const { status, stderr } = runThorDemo(['render', 'quickstart', '--tts', 'local'], repo.tree.dir, {
      THOR_DEMO_ARCHIVE_ROOT: archive.dir,
    });

    expect(status).toBe(0);
    const demoDir = archive.resolve('product/quickstart');
    const [takeName] = readdirSync(demoDir);
    expect(takeName).toMatch(new RegExp(String.raw`^\d{8}-\d{6}Z_${commit.slice(0, 7)}$`));
    const takeDir = path.join(demoDir, takeName ?? '');
    expect(stderr).toContain(`thor-demo render: archived take to ${takeDir}\n`);

    const provenance = readJson(path.join(takeDir, 'provenance.json'));
    expect(provenance).toMatchObject({
      schemaVersion: 1,
      demo: 'quickstart',
      label: 'product',
      source: { commit, dirty: false },
      engine: { package: '@tandryukha/aidemo', version: '0.20.0' },
      voice: { provider: 'local', voiceId: 'af_heart' },
      params: ['--tts', 'local'],
    });
    for (const [name, content] of Object.entries(OUTPUT_FILES)) {
      expect(provenance['files']).toHaveProperty([name], { bytes: content.length, sha256: sha256(content) });
      expect(readFileSync(path.join(takeDir, name), 'utf8')).toBe(content);
    }
  });

  it('archives nothing when the render fails', () => {
    using repo = createDemoRepo({ exitCode: 3, outputFiles: OUTPUT_FILES });
    using archive = createTempTree({ '.keep': '' });

    const { status } = runThorDemo(['render', 'quickstart'], repo.tree.dir, { THOR_DEMO_ARCHIVE_ROOT: archive.dir });

    expect(status).toBe(3);
    expect(readdirSync(archive.dir)).toStrictEqual(['.keep']);
  });

  it('exits 1 when the take cannot be archived, naming where the take remains', () => {
    using repo = createDemoRepo({ outputFiles: { 'report.json': '{}' } });
    using archive = createTempTree({ '.keep': '' });

    const { status, stderr } = runThorDemo(['render', 'quickstart'], repo.tree.dir, {
      THOR_DEMO_ARCHIVE_ROOT: archive.dir,
    });

    expect(status).toBe(1);
    expect(stderr).toContain(
      `final-demo.mp4 not found; the take remains in ${repo.tree.resolve('demos/quickstart/output')}`,
    );
  });

  it('reports that the take is not archived without an archive root, and exits 0', () => {
    using repo = createDemoRepo({ outputFiles: OUTPUT_FILES });

    const { status, stderr } = runThorDemo(['render', 'quickstart'], repo.tree.dir);

    expect(status).toBe(0);
    expect(stderr).toContain(
      'thor-demo render: take not archived: no archive root is set; set archive.root in ~/.config/thor-demo/config.yaml or THOR_DEMO_ARCHIVE_ROOT\n',
    );
  });
});

// region | Helpers

/** Reads a JSON object from a file. */
function readJson(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`${filePath} does not contain a JSON object`);

  return parsed;
}

/** Returns the sha256 of a string, as hex. */
function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// endregion | Helpers
