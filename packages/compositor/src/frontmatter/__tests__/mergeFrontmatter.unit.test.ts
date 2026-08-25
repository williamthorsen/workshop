import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import type { FrontmatterOverlay } from '../../schemas/render-target-schemas.ts';
import { mergeFrontmatter } from '../mergeFrontmatter.ts';
import { parseFrontmatter } from '../parseFrontmatter.ts';

describe(mergeFrontmatter, () => {
  it('merges an override aimed at a block sequence, which the ported original could not do', () => {
    const content = '---\nname: reviewer\nskills:\n  - alpha\n  - beta\n---\nRead the diff.\n';
    const overlay: FrontmatterOverlay = { overrides: { reviewer: { skills: ['gamma'] } } };

    const merged = mergeFrontmatter(content, overlay, 'reviewer');

    expect(readFrontmatter(merged)).toStrictEqual({ name: 'reviewer', skills: ['gamma'] });
    expect(merged).not.toContain('alpha');
  });

  it('keeps the comments on keys the overlay does not touch', () => {
    const content = '---\n# how this agent is addressed\nname: reviewer\nmodel: opus\n---\nBody\n';
    const overlay: FrontmatterOverlay = { overrides: { reviewer: { model: 'sonnet' } } };

    expect(mergeFrontmatter(content, overlay, 'reviewer')).toContain('# how this agent is addressed');
  });

  it('applies defaults beneath a per-artifact override', () => {
    const content = '---\nname: reviewer\n---\nBody\n';
    const overlay: FrontmatterOverlay = {
      defaults: { model: 'opus', color: 'blue' },
      overrides: { reviewer: { model: 'sonnet' } },
    };

    expect(readFrontmatter(mergeFrontmatter(content, overlay, 'reviewer'))).toStrictEqual({
      name: 'reviewer',
      color: 'blue',
      model: 'sonnet',
    });
  });

  it('if the artifact has no applicable override, returns it byte for byte', () => {
    const content = '---\nname: auditor\n---\nBody\n';
    const overlay: FrontmatterOverlay = { overrides: { reviewer: { model: 'sonnet' } } };

    expect(mergeFrontmatter(content, overlay, 'auditor')).toBe(content);
  });

  it('keeps a key already declared where it stood, and appends new keys in sorted order', () => {
    const content = '---\nname: reviewer\nmodel: opus\n---\nBody\n';
    const overlay: FrontmatterOverlay = { defaults: { tools: ['read'], model: 'sonnet', color: 'blue' } };

    const merged = mergeFrontmatter(content, overlay, 'reviewer');
    const { frontmatter } = parseFrontmatter(merged);

    expect(frontmatter?.split('\n', 1).at(0)).toBe('name: reviewer');
    expect(frontmatter?.indexOf('model:')).toBeLessThan(frontmatter?.indexOf('color:') ?? -1);
    expect(frontmatter?.indexOf('color:')).toBeLessThan(frontmatter?.indexOf('tools:') ?? -1);
  });

  it('preserves the body verbatim, including a delimiter line within it', () => {
    const content = '---\nname: reviewer\n---\nAbove.\n\n---\n\nBelow.\n';
    const overlay: FrontmatterOverlay = { defaults: { model: 'opus' } };

    expect(parseFrontmatter(mergeFrontmatter(content, overlay, 'reviewer')).body).toBe('Above.\n\n---\n\nBelow.\n');
  });

  it('if the artifact has no block, writes one above the content it had', () => {
    const overlay: FrontmatterOverlay = { defaults: { model: 'opus' } };

    expect(mergeFrontmatter('# Reviewer\n', overlay, 'reviewer')).toBe('---\nmodel: opus\n---\n# Reviewer\n');
  });

  it('merging twice changes nothing the second time', () => {
    const content = '---\nname: reviewer\nskills:\n  - alpha\n---\nBody\n';
    const overlay: FrontmatterOverlay = { defaults: { skills: ['gamma'], model: 'opus' } };

    const once = mergeFrontmatter(content, overlay, 'reviewer');

    expect(mergeFrontmatter(once, overlay, 'reviewer')).toBe(once);
  });

  it('if the block is not a mapping, throws rather than losing what the artifact declared', () => {
    const overlay: FrontmatterOverlay = { defaults: { model: 'opus' } };

    expect(() => mergeFrontmatter('---\n- alpha\n- beta\n---\nBody\n', overlay, 'reviewer')).toThrow(/not a mapping/);
  });

  it('if the block is never closed, throws rather than writing a second block above the declaration', () => {
    const overlay: FrontmatterOverlay = { defaults: { model: 'opus' } };

    expect(() => mergeFrontmatter('---\nname: reviewer\n', overlay, 'reviewer')).toThrow(/never closed/);
  });
});

// region | Helpers

/** Reads the merged frontmatter back as data, failing the test when the result has no block. */
function readFrontmatter(merged: string): unknown {
  const { frontmatter } = parseFrontmatter(merged);
  if (frontmatter === undefined) {
    throw new Error('Expected the merged artifact to have a frontmatter block.');
  }
  const parsed: unknown = parseYaml(frontmatter);
  return parsed;
}

// endregion | Helpers
