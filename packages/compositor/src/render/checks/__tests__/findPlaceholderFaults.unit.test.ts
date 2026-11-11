import { describe, expect, it } from 'vitest';

import { ARTIFACT_ID_PLACEHOLDER } from '../../../deployment/contribution-markers.ts';
import { findPlaceholderFaults } from '../findPlaceholderFaults.ts';

describe(findPlaceholderFaults, () => {
  it('accepts a template standing the placeholder once on each side', () => {
    const template = { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' };

    expect(findPlaceholderFaults(template, ARTIFACT_ID_PLACEHOLDER, 'contributor', 'markers')).toStrictEqual([]);
  });

  it.each([
    ['stands no placeholder', { open: '<!-- rulebook -->', close: '<!-- /{artifactId} -->' }, 'open', 0],
    ['stands two', { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId}{artifactId} -->' }, 'close', 2],
  ])('reports the side of a template that %s', (_label, template, role, count) => {
    expect(findPlaceholderFaults(template, ARTIFACT_ID_PLACEHOLDER, 'contributor', 'markers')).toStrictEqual([
      {
        path: `markers.${role}`,
        message: expect.stringContaining(`${ARTIFACT_ID_PLACEHOLDER} ${count} times`),
      },
    ]);
  });

  it('reports both sides, open first, when neither stands the placeholder', () => {
    const template = { open: '<!-- start -->', close: '<!-- end -->' };

    expect(findPlaceholderFaults(template, ARTIFACT_ID_PLACEHOLDER, 'contributor', 'markers')).toStrictEqual([
      {
        path: 'markers.open',
        message: expect.stringContaining(`${ARTIFACT_ID_PLACEHOLDER} 0 times`),
      },
      {
        path: 'markers.close',
        message: expect.stringContaining(`${ARTIFACT_ID_PLACEHOLDER} 0 times`),
      },
    ]);
  });
});
