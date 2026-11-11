import { describe, expect, it } from 'vitest';

import type { RenderTarget } from '../../../schemas/render-target-schemas.ts';
import { findHostCollisions } from '../findHostCollisions.ts';

const skillDeployment = {
  form: 'tree',
  kindId: 'skill',
  layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
} as const;

const ambientDeployment = {
  form: 'region',
  kindId: 'rulebook',
  host: 'CLAUDE.md',
  markers: { open: '<!-- codeassembly -->', close: '<!-- /codeassembly -->' },
  contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
} as const;

const deployments: RenderTarget['deployments'] = [skillDeployment, ambientDeployment];

describe(findHostCollisions, () => {
  it('reports a host standing where a layout root goes', () => {
    expect(findHostCollisions('skills', deployments, 'host')).toStrictEqual([
      {
        path: 'host',
        message: 'collides with the layout root "skills", which needs a directory where this host is a file',
      },
    ]);
  });

  it('reports a host standing at a directory a layout root is nested inside', () => {
    const nested = { ...skillDeployment, layout: { ...skillDeployment.layout, root: 'agents/skills' } };

    expect(findHostCollisions('agents', [nested], 'host')).toStrictEqual([
      {
        path: 'host',
        message: 'collides with the layout root "agents/skills", which needs a directory where this host is a file',
      },
    ]);
  });

  // A directory layout claims `skills/<name>/<entryFile>` and never a file directly beneath its root, so a host there
  // contradicts nothing.
  it('accepts a host sitting inside a layout root', () => {
    expect(findHostCollisions('skills/README.md', deployments, 'host')).toStrictEqual([]);
  });

  it('accepts a host beside a layout root', () => {
    expect(findHostCollisions('skills-index.md', deployments, 'host')).toStrictEqual([]);
  });

  // The root is the target's own directory, which every host sits under and none claims as a file.
  it('accepts a host beneath a layout rooted at the target root', () => {
    const rooted = { form: 'tree', kindId: 'skill', layout: { form: 'file', root: '', extension: '.md' } } as const;

    expect(findHostCollisions('CLAUDE.md', [rooted], 'host')).toStrictEqual([]);
  });

  it('reads no layout root from a region deployment', () => {
    expect(findHostCollisions('CLAUDE.md', [ambientDeployment], 'host')).toStrictEqual([]);
  });
});
