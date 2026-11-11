import { describe, expect, it } from 'vitest';

import { INLAY_NAME_PLACEHOLDER } from '../../../inlays/inlay-markers.ts';
import type { RenderTarget } from '../../../schemas/render-target-schemas.ts';
import { CLAUDE_TARGET, INLAY_STAGE } from '../../test-utils/sample-render-targets.ts';
import { findStageFaults } from '../findStageFaults.ts';

describe(findStageFaults, () => {
  it('accepts a link grammar capturing exactly one group', () => {
    expect(findStageFaults(CLAUDE_TARGET, 'targets[0]')).toStrictEqual([]);
  });

  it('reports a link grammar that does not compile', () => {
    const broken: RenderTarget = { ...CLAUDE_TARGET, stages: [{ kind: 'links', pattern: '([a-z' }] };

    expect(findStageFaults(broken, 'targets[0]')).toStrictEqual([
      { path: 'targets[0].stages[0].pattern', message: expect.stringContaining('regular expression') },
    ]);
  });

  it.each([
    ['captures nothing to rewrite', String.raw`\[[^\]]*\]\([^)]+\)`, 0],
    ['leaves the engine a choice of captures', String.raw`\[([^\]]*)\]\(([^)]+)\)`, 2],
  ])('reports a link grammar that %s', (_label, pattern, groups) => {
    const wrong: RenderTarget = { ...CLAUDE_TARGET, stages: [{ kind: 'links', pattern }] };

    expect(findStageFaults(wrong, 'targets[0]')).toStrictEqual([
      {
        path: 'targets[0].stages[0].pattern',
        message: expect.stringContaining(`${groups} groups`),
      },
    ]);
  });

  it('accepts an inlay stage whose markers, contribution markers, and reshape rule all do their jobs', () => {
    expect(findStageFaults({ ...CLAUDE_TARGET, stages: [INLAY_STAGE] }, 'targets[0]')).toStrictEqual([]);
  });

  it.each([
    ['markers', { open: '<!-- {inlayName} -->', close: '<!-- {inlayName} -->' }, 'markers'],
    ['contribution markers', { open: '{artifactId}', close: '{artifactId}' }, 'contributionMarkers'],
  ])("reports an inlay stage's %s that could not delimit a span", (_label, pair, field) => {
    const wrong: RenderTarget = { ...CLAUDE_TARGET, stages: [{ ...INLAY_STAGE, [field]: pair }] };

    expect(findStageFaults(wrong, 'targets[0]').map(({ path }) => path)).toStrictEqual([
      `targets[0].stages[0].${field}`,
    ]);
  });

  it.each([
    ['stands no placeholder', { open: '<!-- start -->', close: '<!-- {inlayName}:end -->' }, 'open', 0],
    ['stands two', { open: '<!-- {inlayName}:{inlayName}:start -->', close: '<!-- {inlayName}:end -->' }, 'open', 2],
  ])('reports an inlay marker template that %s', (_label, markers, role, count) => {
    const wrong: RenderTarget = { ...CLAUDE_TARGET, stages: [{ ...INLAY_STAGE, markers }] };

    expect(findStageFaults(wrong, 'targets[0]')).toStrictEqual([
      {
        path: `targets[0].stages[0].markers.${role}`,
        message: expect.stringContaining(`${INLAY_NAME_PLACEHOLDER} ${count} times`),
      },
    ]);
  });

  it('reports a reshape rule that does not compile', () => {
    const wrong: RenderTarget = {
      ...CLAUDE_TARGET,
      stages: [{ ...INLAY_STAGE, reshape: { pattern: '(#{1,5}', replacement: '$1#' } }],
    };

    expect(findStageFaults(wrong, 'targets[0]')).toStrictEqual([
      { path: 'targets[0].stages[0].reshape.pattern', message: expect.stringContaining('regular expression') },
    ]);
  });

  it("reports an inlay stage's faults in the order markers, inlay names, contribution markers, contributors, reshape", () => {
    const wrong: RenderTarget = {
      ...CLAUDE_TARGET,
      stages: [
        {
          ...INLAY_STAGE,
          markers: { open: '<!-- start -->', close: '<!-- start -->' },
          contributionMarkers: { open: '<!-- x -->', close: '<!-- y -->' },
          reshape: { pattern: '(', replacement: '' },
        },
      ],
    };

    expect(findStageFaults(wrong, 'targets[0]').map(({ path }) => path)).toStrictEqual([
      'targets[0].stages[0].markers',
      'targets[0].stages[0].markers.open',
      'targets[0].stages[0].markers.close',
      'targets[0].stages[0].contributionMarkers.open',
      'targets[0].stages[0].contributionMarkers.close',
      'targets[0].stages[0].reshape.pattern',
    ]);
  });
});
