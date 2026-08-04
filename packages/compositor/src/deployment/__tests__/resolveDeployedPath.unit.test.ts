import { describe, expect, it } from 'vitest';

import type { KindDeployment } from '../../schemas/render-target-schemas.ts';
import { resolveDeployedPath } from '../resolveDeployedPath.ts';

const skill: KindDeployment = {
  kindId: 'skill',
  layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
};
const rulebook: KindDeployment = {
  kindId: 'rulebook',
  layout: { form: 'file', root: 'rulebooks', extension: '.md' },
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
    const guidance: KindDeployment = { kindId: 'guidance', layout: { form: 'file', root: '', extension: '.md' } };

    expect(resolveDeployedPath(guidance, 'CLAUDE')).toBe('CLAUDE.md');
  });

  it('if a file layout is asked for a path within the artifact, throws rather than inventing one', () => {
    expect(() => resolveDeployedPath(rulebook, 'consult-shell', 'assets/logo.svg')).toThrow('is one file');
  });
});
