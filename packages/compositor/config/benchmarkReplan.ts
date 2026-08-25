/**
 * Measures what a what-if replan costs over one capture, which is the loop a reader's toggle drives.
 *
 * Generates a synthetic workspace of a given size, captures once, then replans repeatedly over an edited config and
 * reports the distribution. Run from the package directory:
 *
 *     node config/benchmarkReplan.ts --skills 200 --rulebooks 40 --targets 3 --runs 50
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { composePlan } from '../src/plan/composePlan.ts';
import type { ResolveKind } from '../src/schemas/catalog-schemas.ts';
import type { CompositorConfig } from '../src/schemas/config-schemas.ts';
import { CompositorConfigSchema } from '../src/schemas/config-schemas.ts';
import type { RenderTarget } from '../src/schemas/render-target-schemas.ts';
import { captureSnapshot } from '../src/snapshot/captureSnapshot.ts';

/** The kinds the synthetic workspace contains. */
const KINDS: ReadonlyArray<ResolveKind> = [
  {
    id: 'rulebook',
    label: 'Rulebook',
    emitsFiles: true,
    layout: { form: 'file', root: 'rulebooks', extension: '.md' },
  },
  {
    id: 'skill',
    label: 'Skill',
    emitsFiles: true,
    layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
  },
];

const options = {
  rulebooks: { type: 'string', default: '40' },
  runs: { type: 'string', default: '50' },
  skills: { type: 'string', default: '200' },
  targets: { type: 'string', default: '3' },
} as const;

const { values } = parseArgs({ options });
const size = {
  rulebooks: readCount(values.rulebooks, 'rulebooks'),
  runs: readCount(values.runs, 'runs'),
  skills: readCount(values.skills, 'skills'),
  targets: readCount(values.targets, 'targets'),
};

const workspace = await mkdtemp(path.join(tmpdir(), 'compositor-benchmark-'));
try {
  await buildWorkspace(workspace, size);

  const targets = buildTargets(path.join(workspace, 'targets'), size.targets);
  const config = buildConfig(path.join(workspace, 'source'));

  const capturedAt = performance.now();
  const snapshot = await captureSnapshot({
    config,
    baseDir: workspace,
    kinds: KINDS,
    targets,
    tokenKinds: [],
    edgeRules: [],
    kindKeys: {},
    contentKeyPath: ['compositor', 'content'],
  });
  const captureMs = performance.now() - capturedAt;

  const durations = Array.from({ length: size.runs }, (_unused, run) => {
    const edited = dropSkill(config, run % size.skills);
    const startedAt = performance.now();
    composePlan(edited, snapshot);
    return performance.now() - startedAt;
  });

  printReport(size, captureMs, durations);
} finally {
  await rm(workspace, { recursive: true, force: true });
}

// region | Helpers

/** Builds the config the benchmark captures, taking everything the generated source contains. */
function buildConfig(sourceDir: string): CompositorConfig {
  return CompositorConfigSchema.parse({
    tiers: [
      {
        id: 'project',
        label: 'Project',
        baseDir: sourceDir,
        sources: { use: [{ name: 'team', path: sourceDir }] },
        select: { rulebook: { use: [{ source: 'team' }] }, skill: { use: [{ source: 'team' }] } },
      },
    ],
  });
}

/** Builds one target per requested destination, each deploying skills as a tree and rulebooks into a host. */
function buildTargets(rootDir: string, count: number): Array<RenderTarget> {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `target-${index}`,
    label: `Target ${index}`,
    root: path.join(rootDir, `target-${index}`),
    tokenMappings: [],
    deployments: [
      {
        form: 'tree' as const,
        kindId: 'skill',
        layout: { form: 'directory' as const, root: 'skills', entryFile: 'SKILL.md' },
      },
      {
        form: 'region' as const,
        kindId: 'rulebook',
        host: 'GUIDANCE.md',
        markers: { open: '<!-- compositor -->', close: '<!-- /compositor -->' },
        contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
      },
    ],
    stages: [{ kind: 'transclusion' as const, syntax: { open: '<!--', close: '-->' } }],
  }));
}

/** Writes the synthetic source tree, every skill transcluding one shared partial so expansion does real work. */
async function buildWorkspace(workspace: string, size: Size): Promise<void> {
  const sourceDir = path.join(workspace, 'source');
  await mkdir(path.join(sourceDir, '_data'), { recursive: true });
  await mkdir(path.join(sourceDir, 'rulebooks'), { recursive: true });
  await writeFile(path.join(sourceDir, '_data/shared.md'), 'Shared guidance every skill draws on.\n');

  await Promise.all(
    Array.from({ length: size.skills }, async (_unused, index) => {
      const slug = `skill-${String(index).padStart(4, '0')}`;
      await mkdir(path.join(sourceDir, 'skills', slug), { recursive: true });
      await writeFile(
        path.join(sourceDir, 'skills', slug, 'SKILL.md'),
        `# ${slug}\n\n<!-- include: ../../_data/shared.md /-->\n\nBody of ${slug}.\n`,
      );
    }),
  );

  await Promise.all(
    Array.from({ length: size.rulebooks }, (_unused, index) => {
      const slug = `rulebook-${String(index).padStart(4, '0')}`;
      return writeFile(path.join(sourceDir, 'rulebooks', `${slug}.md`), `Rule ${index}.\n`);
    }),
  );
}

/** Edits the config the way a reader's toggle does: one skill dropped, which is a selection and nothing else. */
function dropSkill(config: CompositorConfig, index: number): CompositorConfig {
  const slug = `skill-${String(index).padStart(4, '0')}`;

  return {
    ...config,
    tiers: config.tiers.map((tier) => ({
      ...tier,
      select: tier.select.map((block) => (block.kindId === 'skill' ? { ...block, drop: [{ artifact: slug }] } : block)),
    })),
  };
}

/** Prints the capture cost beside the replan distribution. */
function printReport(size: Size, captureMs: number, durations: ReadonlyArray<number>): void {
  const sorted = [...durations].toSorted((left, right) => left - right);
  const total = durations.reduce((sum, duration) => sum + duration, 0);

  process.stdout.write(
    [
      `workspace: ${size.skills} skills, ${size.rulebooks} rulebooks, ${size.targets} targets`,
      `capture:   ${captureMs.toFixed(1)} ms`,
      `replan:    ${size.runs} runs`,
      `  min      ${readPercentile(sorted, 0).toFixed(2)} ms`,
      `  median   ${readPercentile(sorted, 0.5).toFixed(2)} ms`,
      `  p95      ${readPercentile(sorted, 0.95).toFixed(2)} ms`,
      `  max      ${readPercentile(sorted, 1).toFixed(2)} ms`,
      `  mean     ${(total / durations.length).toFixed(2)} ms`,
      '',
    ].join('\n'),
  );
}

/** Reads one count argument, refusing anything that is not a positive whole number. */
function readCount(value: string, name: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error(`--${name} takes a positive whole number, not "${value}".`);
  }
  return count;
}

/** Reads one percentile out of an ascending list of durations. */
function readPercentile(sorted: ReadonlyArray<number>, fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[index] ?? NaN;
}

/** How large a workspace the benchmark builds, and how many times it replans over it. */
interface Size {
  readonly rulebooks: number;
  readonly runs: number;
  readonly skills: number;
  readonly targets: number;
}

// endregion | Helpers
