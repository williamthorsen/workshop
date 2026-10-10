import { describe, expect, it } from 'vitest';

import { detectStack } from '../stack-detection.ts';
import { STACK_DETECTORS } from '../stack-detectors.ts';

describe(detectStack, () => {
  it('detects a stack from a dependency of a tracked manifest', () => {
    const result = detectStack(['package.json'], readFrom({ 'package.json': manifest({ next: '15' }) }));
    expect(result).toStrictEqual({ problems: [], stack: ['nextjs'] });
  });

  it('counts devDependencies and leaves peerDependencies out', () => {
    const files = {
      'package.json': JSON.stringify({
        devDependencies: { '@williamthorsen/nmr': '1' },
        peerDependencies: { react: '19' },
      }),
    };
    expect(detectStack(['package.json'], readFrom(files)).stack).toStrictEqual(['nmr']);
  });

  it('reads every tracked manifest, including a nested package', () => {
    const files = {
      'package.json': manifest({}),
      'packages/web/package.json': manifest({ react: '19', '@supabase/supabase-js': '2' }),
    };
    expect(detectStack(Object.keys(files), readFrom(files)).stack).toStrictEqual(['react', 'supabase']);
  });

  it('detects a stack from a tracked path at the root and at any depth', () => {
    expect(detectStack(['vercel.json'], readFrom({})).stack).toStrictEqual(['vercel']);
    expect(detectStack(['apps/api/supabase/config.toml'], readFrom({})).stack).toStrictEqual(['supabase']);
  });

  it('matches a path only as a whole path segment', () => {
    expect(detectStack(['not-vercel.json', 'mysupabase/config.toml'], readFrom({})).stack).toStrictEqual([]);
  });

  it('reads only the manifests in the tracked listing, so an installed package never counts', () => {
    const files = { 'node_modules/next/package.json': manifest({ react: '19' }), 'package.json': manifest({}) };
    expect(detectStack(['package.json'], readFrom(files)).stack).toStrictEqual([]);
  });

  it('reports an unparsable manifest and detects from the others', () => {
    const files = { 'bad/package.json': '{ nope', 'package.json': manifest({ vue: '3' }) };
    const result = detectStack(['bad/package.json', 'package.json'], readFrom(files));
    expect(result.stack).toStrictEqual(['vue']);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/^cannot read bad\/package\.json: /);
  });

  it('reports a manifest that the reader cannot read', () => {
    const result = detectStack(['package.json'], readFrom({}));
    expect(result).toStrictEqual({ problems: ['cannot read package.json: absent: package.json'], stack: [] });
  });

  it('reports a manifest that is not a JSON object', () => {
    const result = detectStack(['package.json'], readFrom({ 'package.json': '[]' }));
    expect(result.problems).toStrictEqual(['cannot read package.json: not a JSON object']);
  });

  it('returns the names sorted', () => {
    const files = { 'package.json': manifest({ vue: '3', express: '5', tailwindcss: '4' }) };
    expect(detectStack(['package.json', 'netlify.toml'], readFrom(files)).stack).toStrictEqual([
      'express',
      'netlify',
      'tailwindcss',
      'vue',
    ]);
  });
});

describe('STACK_DETECTORS', () => {
  it('declares its names in sorted order', () => {
    const names = Object.keys(STACK_DETECTORS);
    expect(names).toStrictEqual(names.toSorted());
  });
});

// region | Helpers

/** Returns the text of a manifest that declares the given dependencies. */
function manifest(dependencies: Record<string, string>): string {
  return JSON.stringify({ dependencies });
}

/** Returns a manifest reader over in-memory files, throwing for a path that it lacks. */
function readFrom(files: Record<string, string>): (trackedPath: string) => string {
  return (trackedPath) => {
    const content = files[trackedPath];
    if (content === undefined) throw new Error(`absent: ${trackedPath}`);
    return content;
  };
}

// endregion | Helpers
