/**
 * Returns an argument quoted as bash's `printf %q` quotes it: backslash-escaped, or ANSI-C quoted (`$'…'`) when it
 * contains a control character.
 */
export function quoteBashArgument(argument: string): string {
  if (argument === '') return "''";
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- bash escapes per code point, never per grapheme
  const characters = [...argument];
  if (characters.some((character) => isControlCharacter(character))) {
    const escaped = characters.map((character) =>
      isControlCharacter(character) || character === "'" || character === '\\'
        ? formatAnsiCEscape(character)
        : character,
    );
    return `$'${escaped.join('')}'`;
  }
  return argument.replaceAll(/[ !"$&'()*,;<>?[\\\]^`{|}]|^[#~]|(?<=[=:])~/g, (character) => `\\${character}`);
}

// region | Helpers

const NAMED_ESCAPES: Readonly<Record<string, string>> = {
  '\u{7}': 'a',
  '\u{8}': 'b',
  '\u{9}': 't',
  '\u{A}': 'n',
  '\u{B}': 'v',
  '\u{C}': 'f',
  '\u{D}': 'r',
  '\u{1B}': 'E',
  "'": "'",
  '\\': '\\',
};

/** Returns a character as bash writes it inside `$'…'`: a named escape where bash has one, else three octal digits. */
function formatAnsiCEscape(character: string): string {
  const named = NAMED_ESCAPES[character];
  if (named !== undefined) return `\\${named}`;
  return `\\${character.codePointAt(0)?.toString(8).padStart(3, '0') ?? ''}`;
}

/** Reports whether a character is a C0 control or DEL, which bash's `%q` writes only inside `$'…'`. */
function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f;
}

// endregion | Helpers
