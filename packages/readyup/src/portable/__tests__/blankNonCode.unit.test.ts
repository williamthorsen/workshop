import { describe, expect, it } from 'vitest';

import { blankComments, blankNonCode } from '../blankNonCode.ts';

const CLAMP = 'Math.max(min, Math.min(max, value))';
const SPECIFIER = `from '@scope/errors'`;

describe(blankNonCode, () => {
  it('matches the source in length and in every line break', () => {
    const source = [
      '#!/usr/bin/env node',
      '/**',
      ` * Bounds a value with ${CLAMP}.`,
      ' */',
      `export const label = 'bounds a value';`,
      `export const bounded = ${CLAMP};`,
      '',
    ].join('\n');

    const blanked = blankNonCode(source);

    expect(blanked).toHaveLength(source.length);
    expect(listLineBreakOffsets(blanked)).toStrictEqual(listLineBreakOffsets(source));
  });

  it('blanks an idiom written in a line comment', () => {
    const comment = `// ${CLAMP}`;
    const source = `const a = 1; ${comment}\nconst b = 2;\n`;

    expect(blankNonCode(source)).toBe(`const a = 1; ${blank(comment)}\nconst b = 2;\n`);
  });

  it('blanks an idiom written in a block comment, across the lines it spans', () => {
    const source = `/* ${CLAMP}\n   and more ${CLAMP} */\nconst b = 2;\n`;

    expect(blankNonCode(source)).toBe(`${blank(`/* ${CLAMP}`)}\n${blank(`   and more ${CLAMP} */`)}\nconst b = 2;\n`);
  });

  it('blanks a quoted string, keeping its delimiters', () => {
    const source = `const a = '${CLAMP}';\nconst b = "${CLAMP}";\n`;

    expect(blankNonCode(source)).toBe(`const a = '${blank(CLAMP)}';\nconst b = "${blank(CLAMP)}";\n`);
  });

  it('reads an escaped delimiter as part of the literal holding it', () => {
    const text = String.raw`it\'s ${CLAMP}`;
    const source = `const a = '${text}';\nconst b = 2;\n`;

    expect(blankNonCode(source)).toBe(`const a = '${blank(text)}';\nconst b = 2;\n`);
  });

  it('blanks a template literal and leaves the expression interpolated into it as code', () => {
    const source = `const label = \`bounded \${${CLAMP}} and ${CLAMP}\`;\n`;

    expect(blankNonCode(source)).toBe(`const label = \`${blank('bounded ')}\${${CLAMP}}${blank(` and ${CLAMP}`)}\`;\n`);
  });

  // Without the interpolation's own brace count, the object literal's `}` would end it and the rest of the
  // expression would blank as though it were template text.
  it('keeps an interpolation open past a brace of its own', () => {
    const source = 'const s = `a ${JSON.stringify({ n: 1 })} b`;\n';

    expect(blankNonCode(source)).toBe(`const s = \`${blank('a ')}\${JSON.stringify({ n: 1 })}${blank(' b')}\`;\n`);
  });

  it('reads an escaped backtick as part of the template holding it', () => {
    const text = String.raw`bounded \` ${CLAMP}`;
    const source = `const label = \`${text}\`;\nconst t = 1;\n`;

    expect(blankNonCode(source)).toBe(`const label = \`${blank(text)}\`;\nconst t = 1;\n`);
  });

  it('unwinds a template literal nested inside an interpolation', () => {
    const source = 'const s = `a ${`b ${x} c`} d`;\n';

    expect(blankNonCode(source)).toBe(
      `const s = \`${blank('a ')}\${\`${blank('b ')}\${x}${blank(' c')}\`}${blank(' d')}\`;\n`,
    );
  });

  it('blanks a regular expression body, keeping its delimiters and flags', () => {
    const body = String.raw`\binstanceof\s+Error\b`;
    const source = `const pattern = /${body}/g;\n`;

    expect(blankNonCode(source)).toBe(`const pattern = /${blank(body)}/g;\n`);
  });

  it('reads a regular expression holding quote delimiters as one literal', () => {
    const body = `['"]`;
    const source = `const quote = /${body}/;\nconst tail = "${CLAMP}";\n`;

    expect(blankNonCode(source)).toBe(`const quote = /${blank(body)}/;\nconst tail = "${blank(CLAMP)}";\n`);
  });

  it('reads a regular expression holding comment delimiters as one literal', () => {
    const body = String.raw`\/\/|\/\*`;
    const source = `const comment = /${body}/;\nconst tail = 2;\n`;

    expect(blankNonCode(source)).toBe(`const comment = /${blank(body)}/;\nconst tail = 2;\n`);
  });

  it('reads a slash after a word or a closing parenthesis as division', () => {
    const source = 'const ratio = a / b / c;\nconst mean = (a + b) / 2;\n';

    expect(blankNonCode(source)).toBe(source);
  });

  it('reads a regular expression opening after an expression keyword', () => {
    const body = 'abc';
    const source = `function isMatch(x) { return /${body}/.test(x); }\n`;

    expect(blankNonCode(source)).toBe(`function isMatch(x) { return /${blank(body)}/.test(x); }\n`);
  });

  // `<` opens no regular expression, so a closing tag's slash divides. Were it a regular-expression position, a
  // line holding two closing tags would blank everything between the first tag's slash and the second's.
  it('leaves JSX closing tags standing as code', () => {
    const source = [
      'const one = <div>{total}</div>;',
      'const two = <span>{a}</span> <span>{' + CLAMP + '}</span>;',
      '',
    ].join('\n');

    expect(blankNonCode(source)).toBe(source);
  });

  it('leaves an unclosed slash standing rather than blanking past its line', () => {
    const source = `const pattern = /abc;\nconst bounded = ${CLAMP};\n`;

    expect(blankNonCode(source)).toBe(source);
  });

  // An apostrophe in prose opens no string, so it cannot swallow the code after it.
  it('leaves an unclosed quote standing rather than blanking past its line', () => {
    const source = `const node = <p>don't</p>;\nconst bounded = ${CLAMP};\n`;

    expect(blankNonCode(source)).toBe(source);
  });

  it('blanks a shebang line', () => {
    const line = '#!/usr/bin/env node';
    const source = `${line}\nconst a = 1;\n`;

    expect(blankNonCode(source)).toBe(`${blank(line)}\nconst a = 1;\n`);
  });

  it('keeps every offset past an astral character inside a blanked span', () => {
    const text = `🎉 ${CLAMP}`;
    const source = `const s = '${text}';\nconst t = 1;\n`;

    const blanked = blankNonCode(source);

    expect(blanked).toBe(`const s = '${blank(text)}';\nconst t = 1;\n`);
    expect(blanked.indexOf('const t')).toBe(source.indexOf('const t'));
  });

  it('leaves a source holding no comment or literal untouched', () => {
    const source = `export const bounded = ${CLAMP};\n`;

    expect(blankNonCode(source)).toBe(source);
  });
});

describe(blankComments, () => {
  it('matches the source in length and in every line break', () => {
    const source = `#!/usr/bin/env node\n// a comment\nimport { describeError } ${SPECIFIER};\n`;

    const blanked = blankComments(source);

    expect(blanked).toHaveLength(source.length);
    expect(listLineBreakOffsets(blanked)).toStrictEqual(listLineBreakOffsets(source));
  });

  it('leaves an import specifier readable while blanking a comment around it', () => {
    const comment = `// import { describeError } ${SPECIFIER};`;
    const source = `${comment}\nimport { describeError } ${SPECIFIER};\n`;

    expect(blankComments(source)).toBe(`${blank(comment)}\nimport { describeError } ${SPECIFIER};\n`);
  });

  it('leaves a quoted string and a template literal standing', () => {
    const source = `const a = '${CLAMP}';\nconst b = \`${CLAMP}\`;\n`;

    expect(blankComments(source)).toBe(source);
  });

  it('leaves a regular expression body standing', () => {
    const source = `const pattern = /${String.raw`\binstanceof\s+Error\b`}/g;\n`;

    expect(blankComments(source)).toBe(source);
  });

  // The literal is read rather than skipped, or the `//` inside it would open a comment and swallow the line.
  it('opens no comment on a slash pair inside a string', () => {
    const source = `const url = 'https://example.test';\nconst a = 1;\n`;

    expect(blankComments(source)).toBe(source);
  });

  it('blanks a block comment holding a quote delimiter', () => {
    const comment = `/* it's ${CLAMP} */`;
    const source = `${comment}\nconst a = 1;\n`;

    expect(blankComments(source)).toBe(`${blank(comment)}\nconst a = 1;\n`);
  });
});

// region | Helpers

/** Renders what a span of the given text blanks to, which is a space per UTF-16 code unit. */
function blank(text: string): string {
  return ' '.repeat(text.length);
}

/** Lists the offset of every line break, which is what a preserved line number rests on. */
function listLineBreakOffsets(text: string): number[] {
  const offsets: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') offsets.push(index);
  }
  return offsets;
}

// endregion | Helpers
