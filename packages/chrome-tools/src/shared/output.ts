import type { Writer } from '@williamthorsen/toolbelt.cli/candidate';
import {
  measureGlyphColumn,
  type OutputStyle,
  type OutputStyleResolution,
  resolveOutputStyle,
  STATUS_GLYPHS,
  type StatusGlyphName,
} from '@williamthorsen/toolbelt.terminal/candidate';

/** The name by which a command reports itself and the streams that it writes to. */
export interface CommandOutput {
  name: string;
  stderr: Writer;
  stdout: Writer;
}

/** Environment variables as the command reads them. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** Terminal escape sequences, each empty when color is off. */
export interface Palette {
  blue: string;
  bold: string;
  cyan: string;
  green: string;
  normal: string;
  red: string;
  yellow: string;
}

/** The environment variable that sets the output style (`auto`, `plain`, or `rich`) in place of detection. */
export const OUTPUT_STYLE_VARIABLE = 'THOR_CHROME_OUTPUT_STYLE';

export const PLAIN_PALETTE: Palette = { blue: '', bold: '', cyan: '', green: '', normal: '', red: '', yellow: '' };

const ANSI_PALETTE: Palette = {
  blue: '\u{1B}[34m',
  bold: '\u{1B}[1m',
  cyan: '\u{1B}[36m',
  green: '\u{1B}[32m',
  normal: '\u{1B}[0m',
  red: '\u{1B}[31m',
  yellow: '\u{1B}[33m',
};

/**
 * Returns a status's glyph in a style, padded to the width of the style's widest glyph so that the text after it aligns,
 * and coloured when the status is one that the palette colours.
 */
export function formatStatus(palette: Palette, style: OutputStyle, status: StatusGlyphName): string {
  const glyphs = STATUS_GLYPHS[style];
  const glyph = glyphs[status];
  const padding = ' '.repeat(measureGlyphColumn(glyphs) - glyph.width);
  const colors: Record<StatusGlyphName, string> = {
    blocked: '',
    failed: palette.red,
    info: '',
    passed: palette.green,
    skipped: '',
    warning: palette.yellow,
  };
  const color = colors[status];
  return color === '' ? `${glyph.text}${padding}` : `${color}${glyph.text}${palette.normal}${padding}`;
}

/** Resolves the output style for output written to one stream: `OUTPUT_STYLE_VARIABLE` when set, else detection. */
export function resolveStreamOutputStyle(env: Environment, isTty: boolean): OutputStyleResolution {
  return resolveOutputStyle({ argv: [], env, envVar: OUTPUT_STYLE_VARIABLE, isTty });
}

/**
 * Enables color only when NO_COLOR is unset or empty, the output is a terminal, and the terminal type can render escape
 * sequences.
 */
export function resolvePalette(env: Environment, isTerminal: boolean): Palette {
  const term = env['TERM'] ?? '';
  if ((env['NO_COLOR'] ?? '') !== '' || !isTerminal || term === '' || term === 'dumb') {
    return PLAIN_PALETTE;
  }
  return ANSI_PALETTE;
}
