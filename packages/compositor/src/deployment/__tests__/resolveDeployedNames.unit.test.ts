import { describe, expect, it } from 'vitest';

import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import type { DeployableArtifact } from '../resolveDeployedNames.ts';
import { resolveDeployedNames } from '../resolveDeployedNames.ts';

const skillLayout = { form: 'directory', root: 'skills', entryFile: 'SKILL.md' } as const;
const rulebookLayout = { form: 'file', root: 'rulebooks', extension: '.md' } as const;

const ambient = {
  form: 'region',
  kindId: 'rulebook',
  host: 'CLAUDE.md',
  markers: { open: '<!-- codeassembly -->', close: '<!-- /codeassembly -->' },
  contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
} as const;

const review: DeployableArtifact = { id: 'skill:review', kindId: 'skill', slug: 'review' };
const shell: DeployableArtifact = { id: 'rulebook:shell', kindId: 'rulebook', slug: 'shell' };

const claude: RenderTarget = {
  id: 'claude',
  label: 'Claude',
  root: '~/.claude',
  tokenMappings: [],
  deployments: [{ form: 'tree', kindId: 'skill', layout: skillLayout }],
  stages: [],
};

describe(resolveDeployedNames, () => {
  it('resolves an artifact to its slug where the kind declares no template', () => {
    const resolve = resolveDeployedNames([review], [claude]);

    expect(resolve('claude', 'skill:review')).toBe('review');
  });

  it('renders the kind template around the slug', () => {
    const target = withDeployment(claude, {
      form: 'tree',
      kindId: 'rulebook',
      layout: rulebookLayout,
      nameTemplate: 'consult-{slug}',
    });

    const resolve = resolveDeployedNames([shell], [target]);

    expect(resolve('claude', 'rulebook:shell')).toBe('consult-shell');
  });

  it("prefers an artifact's own name over the one its kind template would produce", () => {
    const target = withDeployment(claude, {
      form: 'tree',
      kindId: 'rulebook',
      layout: rulebookLayout,
      nameTemplate: 'consult-{slug}',
    });
    const named: DeployableArtifact = { ...shell, deployedName: 'shell-conventions' };

    const resolve = resolveDeployedNames([named], [target]);

    expect(resolve('claude', 'rulebook:shell')).toBe('shell-conventions');
  });

  it('inserts a slug carrying replacement-pattern syntax verbatim', () => {
    const target = withDeployment(claude, {
      form: 'tree',
      kindId: 'rulebook',
      layout: rulebookLayout,
      nameTemplate: 'x-{slug}',
    });
    const odd: DeployableArtifact = { ...shell, slug: '$&y' };

    const resolve = resolveDeployedNames([odd], [target]);

    expect(resolve('claude', 'rulebook:shell')).toBe('x-$&y');
  });

  it('resolves an artifact whose kind the target does not deploy to nothing', () => {
    const resolve = resolveDeployedNames([review, shell], [claude]);

    expect(resolve('claude', 'rulebook:shell')).toBeUndefined();
  });

  it('resolves nothing for a target it was not given', () => {
    const resolve = resolveDeployedNames([review], [claude]);

    expect(resolve('rovodev', 'skill:review')).toBeUndefined();
  });

  it('resolves a region-routed artifact to the host it contributes to', () => {
    const target = withDeployment(claude, ambient);

    const resolve = resolveDeployedNames([shell], [target]);

    expect(resolve('claude', 'rulebook:shell')).toBe('CLAUDE.md');
  });

  // The field overrides the name a kind's template would produce, and a contributor to a host has no such name.
  it('ignores an artifact’s own deployed name where its kind routes into a host', () => {
    const target = withDeployment(claude, ambient);
    const named: DeployableArtifact = { ...shell, deployedName: 'elsewhere.md' };

    const resolve = resolveDeployedNames([named], [target]);

    expect(resolve('claude', 'rulebook:shell')).toBe('CLAUDE.md');
  });

  it('resolves one artifact to a different name per target, which is what makes a name per-target', () => {
    const rovodev: RenderTarget = {
      ...claude,
      id: 'rovodev',
      label: 'Rovo Dev',
      root: '~/.rovodev',
      deployments: [{ form: 'tree', kindId: 'skill', layout: skillLayout, nameTemplate: '{slug}-skill' }],
    };

    const resolve = resolveDeployedNames([review], [claude, rovodev]);

    expect(resolve('claude', 'skill:review')).toBe('review');
    expect(resolve('rovodev', 'skill:review')).toBe('review-skill');
  });
});

// region | Helpers

/** Builds a target carrying one more deployment than `target`, leaving the original untouched. */
function withDeployment(target: RenderTarget, deployment: RenderTarget['deployments'][number]): RenderTarget {
  return { ...target, deployments: [...target.deployments, deployment] };
}

// endregion | Helpers
