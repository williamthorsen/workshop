import { describe, expect, it } from 'vitest';

import { blankNonCode } from '../blankNonCode.ts';
import { type DeclarationSpan, listDeclarationSpans } from '../listDeclarationSpans.ts';

describe(listDeclarationSpans, () => {
  it('covers a declaration from its head through its body', () => {
    const spans = listSpans(['export function describeError(error: unknown) {', '  return String(error);', '}', '']);

    expect(spans).toStrictEqual([{ endLine: 3, name: 'describeError', startLine: 1 }]);
  });

  it.for([
    ['function', 'function describeError(error: unknown) {}'],
    ['exported function', 'export function describeError(error: unknown) {}'],
    ['const', 'export const describeError = (error: unknown) => {};'],
    ['let', 'export let describeError = (error: unknown) => {};'],
    ['var', 'export var describeError = (error: unknown) => {};'],
    ['class', 'export class describeError {}'],
    ['abstract class', 'export abstract class describeError {}'],
    ['async function', 'export async function describeError(error: unknown) {}'],
    ['generator function', 'export function* describeError(error: unknown) {}'],
    ['default function', 'export default function describeError(error: unknown) {}'],
    ['declared function', 'declare function describeError(error: unknown): void;'],
    ['interface', 'export interface describeError {}'],
    ['type alias', 'export type describeError = (error: unknown) => string;'],
    ['enum', 'export enum describeError {}'],
  ] as const)('names the declaration a top-level %s introduces', ([, text]) => {
    expect(listSpans([text])).toStrictEqual([{ endLine: 1, name: 'describeError', startLine: 1 }]);
  });

  it('gives each overload signature a span of its own', () => {
    const spans = listSpans([
      'export function describeError(error: string): string;',
      'export function describeError(error: number): string;',
      'export function describeError(error: unknown): string {',
      '  return String(error);',
      '}',
    ]);

    expect(spans).toStrictEqual([
      { endLine: 1, name: 'describeError', startLine: 1 },
      { endLine: 2, name: 'describeError', startLine: 2 },
      { endLine: 5, name: 'describeError', startLine: 3 },
    ]);
  });

  it('covers a body through a head carrying a brace-bearing generic constraint', () => {
    const spans = listSpans([
      'export function describeError<T extends { message: string }>(error: T): string {',
      '  return error.message;',
      '}',
    ]);

    expect(spans).toStrictEqual([{ endLine: 3, name: 'describeError', startLine: 1 }]);
  });

  it('covers a body through a head carrying a brace-bearing return-type annotation', () => {
    const spans = listSpans([
      'export function describeError(error: unknown): { message: string } {',
      '  return { message: String(error) };',
      '}',
      'const separate = 1;',
    ]);

    expect(spans).toStrictEqual([
      { endLine: 3, name: 'describeError', startLine: 1 },
      { endLine: 4, name: 'separate', startLine: 4 },
    ]);
  });

  it('ends a declaration at the line before the next one', () => {
    const spans = listSpans(['function toMessage(error: unknown) {}', 'function describeError(error: unknown) {}']);

    expect(spans).toStrictEqual([
      { endLine: 1, name: 'toMessage', startLine: 1 },
      { endLine: 2, name: 'describeError', startLine: 2 },
    ]);
  });

  it('ends the last declaration at the file’s last line', () => {
    const spans = listSpans([
      'export const describeError = (error: unknown) => String(error);',
      'describeError(new Error());',
      '',
    ]);

    expect(spans).toStrictEqual([{ endLine: 2, name: 'describeError', startLine: 1 }]);
  });

  it('bounds a declaration by an export clause without giving the clause a span', () => {
    const spans = listSpans([
      'function toMessage(error: unknown) {}',
      'export { toMessage as describeError };',
      'const trailing = 1;',
    ]);

    expect(spans).toStrictEqual([
      { endLine: 1, name: 'toMessage', startLine: 1 },
      { endLine: 3, name: 'trailing', startLine: 3 },
    ]);
  });

  it('bounds a declaration by a destructuring binding that names nothing', () => {
    const spans = listSpans([
      'export function round(value: number) {',
      '  return value;',
      '}',
      'const { floor } = Math;',
    ]);

    expect(spans).toStrictEqual([{ endLine: 3, name: 'round', startLine: 1 }]);
  });

  it('bounds a declaration by a control-flow statement', () => {
    const spans = listSpans([
      'export function round(value: number) {',
      '  return value;',
      '}',
      'if (flag) {',
      '  round(1);',
      '}',
    ]);

    expect(spans).toStrictEqual([{ endLine: 3, name: 'round', startLine: 1 }]);
  });

  it('gives a for statement no span for the binding in its header', () => {
    const spans = listSpans([
      'export function round(value: number) {}',
      'for (const item of items) {',
      '  round(item);',
      '}',
    ]);

    expect(spans).toStrictEqual([{ endLine: 1, name: 'round', startLine: 1 }]);
  });

  it('reads a trailing const assertion as part of the declaration holding it', () => {
    const spans = listSpans(['export const config = {', '  places: 2,', '} as const;', 'function helper() {}']);

    expect(spans).toStrictEqual([
      { endLine: 3, name: 'config', startLine: 1 },
      { endLine: 4, name: 'helper', startLine: 4 },
    ]);
  });

  it('gives an import no span of its own', () => {
    const spans = listSpans([
      "import { describeError } from '@scope/errors';",
      'const message = describeError(new Error());',
    ]);

    expect(spans).toStrictEqual([{ endLine: 2, name: 'message', startLine: 2 }]);
  });

  it('reads a named function expression in an argument list as part of the declaration holding it', () => {
    const spans = listSpans([
      'export const compare = createComparator(',
      '  function byLength(a: string, b: string) {',
      '    return a.length - b.length;',
      '  },',
      ');',
    ]);

    expect(spans).toStrictEqual([{ endLine: 5, name: 'compare', startLine: 1 }]);
  });

  it('reads a named class expression in an initializer as part of the declaration holding it', () => {
    const spans = listSpans(['export const Guard = class Inner {', '  check() {}', '};']);

    expect(spans).toStrictEqual([{ endLine: 3, name: 'Guard', startLine: 1 }]);
  });

  it('reads a named function expression an arrow returns as part of the declaration holding it', () => {
    const spans = listSpans([
      'export const wrap = () =>',
      '  function inner(value: string) {',
      '    return value;',
      '  };',
    ]);

    expect(spans).toStrictEqual([{ endLine: 4, name: 'wrap', startLine: 1 }]);
  });

  it('reads an async function expression in an argument list as part of the declaration holding it', () => {
    const spans = listSpans([
      'export const debounced = debounce(',
      '  async function refresh(id: string) {',
      '    await load(id);',
      '  },',
      '  200,',
      ');',
    ]);

    expect(spans).toStrictEqual([{ endLine: 6, name: 'debounced', startLine: 1 }]);
  });

  it('reads an async function expression an arrow returns as part of the declaration holding it', () => {
    const spans = listSpans([
      'export const wrap = () =>',
      '  async function inner(id: string) {',
      '    return id;',
      '  };',
    ]);

    expect(spans).toStrictEqual([{ endLine: 4, name: 'wrap', startLine: 1 }]);
  });

  it('reads a function expression a new operator applies as part of the declaration holding it', () => {
    const spans = listSpans(['export const made = new function Inner() {', '  this.a = 1;', '};']);

    expect(spans).toStrictEqual([{ endLine: 3, name: 'made', startLine: 1 }]);
  });

  it('reads a dynamic import as part of the declaration holding it', () => {
    const spans = listSpans(['export const registry = await import(', "  './registry.ts'", ');', 'const tail = 1;']);

    expect(spans).toStrictEqual([
      { endLine: 3, name: 'registry', startLine: 1 },
      { endLine: 4, name: 'tail', startLine: 4 },
    ]);
  });

  it('names a declaration following a statement ending in a property spelled like an operand keyword', () => {
    const spans = listSpans([
      'const impl = mod.default',
      'export function run(value: number) {',
      '  return value;',
      '}',
    ]);

    expect(spans).toStrictEqual([
      { endLine: 1, name: 'impl', startLine: 1 },
      { endLine: 4, name: 'run', startLine: 2 },
    ]);
  });

  it('names a declaration following a statement ending in an optionally chained such property', () => {
    const spans = listSpans(['const impl = mod?.default', 'export function run(value: number) {}']);

    expect(spans).toStrictEqual([
      { endLine: 1, name: 'impl', startLine: 1 },
      { endLine: 2, name: 'run', startLine: 2 },
    ]);
  });

  it('names a declaration following a statement that ends without a semicolon', () => {
    const spans = listSpans(['const count = 1', 'export function describeError(error: unknown) {}']);

    expect(spans).toStrictEqual([
      { endLine: 1, name: 'count', startLine: 1 },
      { endLine: 2, name: 'describeError', startLine: 2 },
    ]);
  });

  it('names no declaration nested inside another', () => {
    const spans = listSpans([
      'export function outer() {',
      '  function describeError(error: unknown) {}',
      '  return describeError;',
      '}',
    ]);

    expect(spans).toStrictEqual([{ endLine: 4, name: 'outer', startLine: 1 }]);
  });

  it('names no declaration inside a namespace, which sits at brace depth one', () => {
    const spans = listSpans(['export namespace deep {', '  export function describeError(error: unknown) {}', '}']);

    expect(spans).toStrictEqual([]);
  });

  it('names no declaration written in a comment', () => {
    expect(listSpans(['// export function describeError(error: unknown) {}'])).toStrictEqual([]);
  });

  it('names no declaration quoted in a string', () => {
    expect(listSpans(["const sample = 'export function describeError() {}';"])).toStrictEqual([
      { endLine: 1, name: 'sample', startLine: 1 },
    ]);
  });

  it('lists nothing for a source holding no declaration', () => {
    expect(listSpans([''])).toStrictEqual([]);
  });
});

// region | Helpers

/** Blanks the lines a case supplies and lists the spans they hold, as a caller of the primitive does. */
function listSpans(lines: readonly string[]): DeclarationSpan[] {
  return listDeclarationSpans(blankNonCode(lines.join('\n')));
}

// endregion | Helpers
