import { describe, expect, it } from 'vitest';

import type { KindDeployment } from '../../schemas/render-target-schemas.ts';
import { resolveDeployedPath } from '../resolveDeployedPath.ts';

const skill: KindDeployment = {
  form: 'tree',
  kindId: 'skill',
  layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
};
const rulebook: KindDeployment = {
  form: 'tree',
  kindId: 'rulebook',
  layout: { form: 'file', root: 'rulebooks', extension: '.md' },
};
const ambient: KindDeployment = {
  form: 'region',
  kindId: 'rulebook',
  host: 'CLAUDE.md',
  markers: { open: '<!-- codeassembly -->', close: '<!-- /codeassembly -->' },
  contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
};

describe(resolveDeployedPath, () => {
  it('places a directory layout at its entry file', () => {
    expect(resolveDeployedPath(skill, 'review')).toBe('skills/review/SKILL.md');
  });

  it('places a file beside the entry file when one is named', () => {
    expect(resolveDeployedPath(skill, 'review', '_data/rubric.md')).toBe('skills/review/_data/rubric.md');
  });

  it('places a file layout at the deployed name and extension', () => {
    expect(resolveDeployedPath(rulebook, 'consult-shell')).toBe('rulebooks/consult-shell.md');
  });

  it('places a layout rooted at the empty string directly at the target root', () => {
    const guidance: KindDeployment = {
      form: 'tree',
      kindId: 'guidance',
      layout: { form: 'file', root: '', extension: '.md' },
    };

    expect(resolveDeployedPath(guidance, 'CLAUDE')).toBe('CLAUDE.md');
  });

  it('if a file layout is asked for a path within the artifact, throws rather than inventing one', () => {
    expect(() => resolveDeployedPath(rulebook, 'consult-shell', 'assets/logo.svg')).toThrow('is one file');
  });

  it('places a region-routed kind at its host, wherever the deployed name came from', () => {
    expect(resolveDeployedPath(ambient, 'CLAUDE.md')).toBe('CLAUDE.md');
  });

  it('if a region-routed kind is asked for a path within the artifact, throws rather than inventing one', () => {
    expect(() => resolveDeployedPath(ambient, 'CLAUDE.md', 'assets/logo.svg')).toThrow('contributes to a host');
  });
});
