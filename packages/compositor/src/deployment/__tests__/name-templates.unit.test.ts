import { describe, expect, it } from 'vitest';

import { invertDeployedName, renderDeployedName } from '../name-templates.ts';

const templates = [undefined, '{slug}', 'consult-{slug}', '{slug}-skill', 'a-{slug}-b', '{slug}.{slug}'];
const slugs = ['review', 'shell-conventions', 'a.b', '$&'];

describe(invertDeployedName, () => {
  it('recovers the slug a template stood the placeholder for', () => {
    expect(invertDeployedName('consult-{slug}', 'consult-shell')).toBe('shell');
  });

  it('reads a name as its own slug where the kind declares no template', () => {
    expect(invertDeployedName(undefined, 'review')).toBe('review');
  });

  it('inverts every name the render produces, which is what makes a claim recover the artifact', () => {
    for (const template of templates) {
      for (const slug of slugs) {
        expect(invertDeployedName(template, renderDeployedName(template, slug))).toBe(slug);
      }
    }
  });

  it('refuses a name the template could not have produced', () => {
    expect(invertDeployedName('consult-{slug}', 'review')).toBeUndefined();
  });

  it('refuses a name the template matches only part of, so a literal accounts for the whole name', () => {
    expect(invertDeployedName('consult-{slug}', 'x-consult-shell')).toBeUndefined();
  });

  it('reads a template’s literal parts literally, so a regular-expression character stands for itself', () => {
    expect(invertDeployedName('consult.{slug}', 'consult.shell')).toBe('shell');
    expect(invertDeployedName('consult.{slug}', 'consultXshell')).toBeUndefined();
  });

  it('refuses a name standing an empty slug', () => {
    expect(invertDeployedName('consult-{slug}', 'consult-')).toBeUndefined();
    expect(invertDeployedName(undefined, '')).toBeUndefined();
  });

  it('refuses every name where the template stands no placeholder', () => {
    expect(invertDeployedName('CLAUDE.md', 'CLAUDE.md')).toBeUndefined();
  });
});

describe(renderDeployedName, () => {
  it('renders the slug itself where the kind declares no template', () => {
    expect(renderDeployedName(undefined, 'review')).toBe('review');
  });

  it('inserts a slug carrying replacement-pattern syntax verbatim', () => {
    expect(renderDeployedName('x-{slug}', '$&y')).toBe('x-$&y');
  });
});
