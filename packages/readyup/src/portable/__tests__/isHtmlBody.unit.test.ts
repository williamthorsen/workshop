import { describe, expect, it } from 'vitest';

import { isHtmlBody } from '../isHtmlBody.ts';

describe(isHtmlBody, () => {
  it.each([
    { label: 'an <html tag', body: '<html><body>Not Found</body></html>' },
    { label: 'an uppercase doctype', body: '<!DOCTYPE html><html></html>' },
    { label: 'a lowercase doctype', body: '<!doctype html>' },
    { label: 'a mixed-case tag', body: '<HtMl></HtMl>' },
    { label: 'a doctype behind leading whitespace', body: '\n  <!DOCTYPE html>' },
    { label: 'an <html tag behind leading whitespace', body: '  \t<html>' },
  ])('reports true for $label', ({ body }) => {
    expect(isHtmlBody(body)).toBe(true);
  });

  it.each([
    { label: 'a JSON manifest', body: '{"kits":[{"name":"default"}]}' },
    { label: 'a compiled kit bundle', body: 'export const kit = { name: "default" };' },
    { label: 'a plain-text error', body: '404: Not Found' },
    { label: 'the empty string', body: '' },
    { label: 'a source that mentions a tag past its first token', body: 'const template = "<html>";' },
  ])('reports false for $label', ({ body }) => {
    expect(isHtmlBody(body)).toBe(false);
  });
});
