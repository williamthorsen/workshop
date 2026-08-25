import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { KindDeploymentSchema, RenderStageSchema, RenderTargetSchema } from '../render-target-schemas.ts';
import { TargetEntrySchema } from '../target-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const deployment = {
  form: 'tree',
  kindId: 'skill',
  layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
};
const regionDeployment = {
  form: 'region',
  kindId: 'rulebook',
  host: 'CLAUDE.md',
  markers: { open: '<!-- codeassembly -->', close: '<!-- /codeassembly -->' },
  contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
};
const inlayStage = {
  kind: 'inlay',
  syntax: { open: '<!--', close: '-->' },
  markers: { open: '<!-- inlay:{inlayName}:start -->', close: '<!-- inlay:{inlayName}:end -->' },
  contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
  reshape: { pattern: String.raw`^(#{1,5})(?=\s)`, replacement: '$1#' },
};
const target = {
  id: 'claude',
  label: 'Claude',
  root: '~/.claude',
  tokenMappings: [],
  deployments: [deployment],
  stages: [{ kind: 'tokens' }],
};

describe('RenderTargetSchema', () => {
  it('accepts a target declaring where it deploys and what it runs', () => {
    expect(RenderTargetSchema.parse(target)).toStrictEqual(target);
  });

  it('accepts a target owning items inside a structured host another tool also writes', () => {
    const owning = {
      ...target,
      ownedItems: [
        {
          format: 'json',
          collection: ['hooks'],
          sentinel: { path: ['source'], value: 'codeassembly' },
          host: 'settings.json',
          items: [{ command: 'relay --on=stop' }],
        },
      ],
    };

    expect(RenderTargetSchema.parse(owning)).toStrictEqual(owning);
  });

  it('accepts a target declaring no owned items, which is every target that writes no structured host', () => {
    expect(RenderTargetSchema.parse(target)).not.toHaveProperty('ownedItems');
  });

  it('accepts a target running no stages, which renders every body verbatim', () => {
    const inert = { ...target, stages: [] };

    expect(RenderTargetSchema.parse(inert)).toStrictEqual(inert);
  });

  it('produces a target a plan accepts in its own targets table', () => {
    const rendered = RenderTargetSchema.parse(target);

    expect(TargetEntrySchema.parse(rendered)).toStrictEqual({
      id: 'claude',
      label: 'Claude',
      root: '~/.claude',
      tokenMappings: [],
    });
  });

  it.each(['deployments', 'stages'] as const)('if %s is absent, rejects the target for that field', (field) => {
    const { [field]: _dropped, ...incomplete } = target;

    expect(findIssuePaths(RenderTargetSchema, incomplete)).toStrictEqual([[field]]);
  });

  // Objects stay open so a consumer pinned to this version accepts a payload containing a field added later.
  it('accepts a target containing an unrecognized key, and strips it', () => {
    expect(RenderTargetSchema.parse({ ...target, addedLater: 'ignored' })).toStrictEqual(target);
  });

  it('renders to JSON Schema, so a published document describes what this package accepts', () => {
    expect(z.toJSONSchema(RenderTargetSchema).$defs).toHaveProperty(['KindDeployment']);
  });
});

describe('KindDeploymentSchema', () => {
  it('accepts a deployment naming the template the deployed name renders from', () => {
    const derived = { ...deployment, nameTemplate: 'consult-{slug}' };

    expect(KindDeploymentSchema.parse(derived)).toStrictEqual(derived);
  });

  it('accepts a deployment declaring no template, which deploys an artifact under its slug', () => {
    expect(KindDeploymentSchema.parse(deployment)).toStrictEqual(deployment);
  });

  it('if the layout is absent, rejects the deployment for that field', () => {
    const { layout: _dropped, ...withoutLayout } = deployment;

    expect(findIssuePaths(KindDeploymentSchema, withoutLayout)).toStrictEqual([['layout']]);
  });

  it('accepts a deployment routing its kind into a region of a host', () => {
    expect(KindDeploymentSchema.parse(regionDeployment)).toStrictEqual(regionDeployment);
  });

  it.each(['host', 'markers', 'contributionMarkers'] as const)(
    'if %s is absent, rejects the region deployment for that field',
    (field) => {
      const { [field]: _dropped, ...incomplete } = regionDeployment;

      expect(findIssuePaths(KindDeploymentSchema, incomplete)).toStrictEqual([[field]]);
    },
  );

  // A host is a path, and the empty string names none; a layout root may be empty, which is a different question.
  it('if the host is empty, rejects the region deployment for that field', () => {
    expect(findIssuePaths(KindDeploymentSchema, { ...regionDeployment, host: '' })).toStrictEqual([['host']]);
  });

  it('if the form is outside the known set, rejects the deployment for that field', () => {
    expect(findIssuePaths(KindDeploymentSchema, { ...deployment, form: 'entries' })).toStrictEqual([['form']]);
  });

  it('renders both forms to JSON Schema, so a published document describes either', () => {
    const { $defs } = z.toJSONSchema(KindDeploymentSchema);

    expect($defs).toHaveProperty(['TreeKindDeployment']);
    expect($defs).toHaveProperty(['RegionKindDeployment']);
  });
});

describe('RenderStageSchema', () => {
  it('accepts the transclusion stage with the comment syntax its directives are written in', () => {
    const stage = { kind: 'transclusion', syntax: { open: '<!--', close: '-->' } };

    expect(RenderStageSchema.parse(stage)).toStrictEqual(stage);
  });

  it('accepts the links stage with the grammar it matches', () => {
    const stage = { kind: 'links', pattern: String.raw`\[[^\]]*\]\(([^)]+)\)` };

    expect(RenderStageSchema.parse(stage)).toStrictEqual(stage);
  });

  it('accepts the frontmatter stage with the metadata the target overlays', () => {
    const stage = { kind: 'frontmatter', overlay: { defaults: { model: 'opus' } } };

    expect(RenderStageSchema.parse(stage)).toStrictEqual(stage);
  });

  it('accepts the inlay stage with its syntax, its markers, and the rewrite that reshapes a bound body', () => {
    expect(RenderStageSchema.parse(inlayStage)).toStrictEqual(inlayStage);
  });

  it('accepts an inlay stage declaring no reshape, which splices a bound body as it stands', () => {
    const { reshape: _dropped, ...unreshaped } = inlayStage;

    expect(RenderStageSchema.parse(unreshaped)).toStrictEqual(unreshaped);
  });

  it.each(['syntax', 'markers', 'contributionMarkers'] as const)(
    'if the inlay stage omits %s, rejects it for that field',
    (field) => {
      const { [field]: _dropped, ...incomplete } = inlayStage;

      expect(findIssuePaths(RenderStageSchema, incomplete)).toStrictEqual([[field]]);
    },
  );

  it('if the stage kind is outside the known set, rejects the stage for that field', () => {
    expect(findIssuePaths(RenderStageSchema, { kind: 'variables', pattern: '(x)' })).toStrictEqual([['kind']]);
  });

  it('if the links stage declares no pattern, rejects it for that field', () => {
    expect(findIssuePaths(RenderStageSchema, { kind: 'links' })).toStrictEqual([['pattern']]);
  });
});
