/** Styles output can actually be rendered in. */
export const STYLES = ['plain', 'rich'] as const;

export type Style = (typeof STYLES)[number];

/** Everything `--style` accepts, including the value that defers to detection. */
export const STYLE_SETTINGS = ['auto', ...STYLES] as const;

export type StyleSetting = (typeof STYLE_SETTINGS)[number];

/** Flag naming the style for one invocation. */
export const STYLE_FLAG = '--style';

/** Environment variable holding a standing style preference. */
export const STYLE_ENV_VAR = 'RDY_STYLE';

/** The accepted settings widened to strings, so an arbitrary input can be tested for membership. */
const ACCEPTED_SETTINGS: ReadonlySet<string> = new Set<string>(STYLE_SETTINGS);

/** The source that named a style, and the value it named. */
export interface InvalidStyle {
  source: string;
  value: string;
}

/** A style to render with, alongside any complaint the inputs provoked. */
export interface StyleResolution {
  style: Style;
  invalid?: InvalidStyle;
}

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Resolves the style to render in: the flag, else the environment variable, else detection.
 *
 * Pure by design. The environment and the terminal arrive as arguments rather than being read from
 * `process`, so every branch below is reachable from a plain assertion instead of a stubbed global.
 *
 * Never throws. A value naming no style is reported back rather than raised, because the caller has to
 * render its complaint about that value in some style, and a resolver that threw would leave it none.
 * Resolution continues past a bad value, so the rendering falls to whatever the next source says.
 */
export function resolveStyle(argv: string[], env: Environment, isTty: boolean): StyleResolution {
  const candidates = [
    { source: STYLE_FLAG, value: readStyleFlag(argv) },
    { source: STYLE_ENV_VAR, value: env[STYLE_ENV_VAR] },
  ];

  let invalid: InvalidStyle | undefined;
  let setting: StyleSetting | undefined;

  for (const candidate of candidates) {
    const { source, value } = candidate;
    if (value === undefined || value === '') continue;

    if (!isStyleSetting(value)) {
      invalid ??= { source, value };
      continue;
    }

    setting = value;
    break;
  }

  const style = setting === undefined || setting === 'auto' ? detectStyle(env, isTty) : setting;
  return invalid === undefined ? { style } : { style, invalid };
}

/** Returns the usage message for a source that named a style that does not exist. */
export function describeInvalidStyle({ source, value }: InvalidStyle): string {
  return `${source} must be one of: ${STYLE_SETTINGS.join(', ')} (got "${value}")`;
}

// -- Helpers --

/**
 * Reads the style an invocation asks for by scanning raw argv, before any flag parsing happens.
 *
 * Answering this without `parseArgs` is what lets a flag-parse failure be rendered in the style the caller
 * asked for. The scan accepts both `--style plain` and `--style=plain`, stops at the `--` terminator after
 * which arguments are positional, and keeps the last occurrence, matching what `parseArgs` would resolve.
 */
function readStyleFlag(argv: string[]): string | undefined {
  const assignment = `${STYLE_FLAG}=`;
  let value: string | undefined;

  for (const [index, arg] of argv.entries()) {
    if (arg === '--') break;
    if (arg === STYLE_FLAG) value = argv[index + 1];
    else if (arg.startsWith(assignment)) value = arg.slice(assignment.length);
  }

  return value;
}

/**
 * Returns the style the environment implies: plain wherever the output is not a person's terminal.
 *
 * Both signals matter on their own. `CI` catches a runner that allocates a pseudo-terminal, where the
 * terminal check alone would emit emoji into a log nobody can grep; the terminal check catches an
 * interactive pipe into `grep`, where `CI` is unset. `CI` is also not universal -- Jenkins does not set
 * it. An explicit `CI=false` is honored as a denial, which is how the wider ecosystem reads it.
 */
function detectStyle(env: Environment, isTty: boolean): Style {
  const ci = env['CI'];
  if (ci !== undefined && ci !== '' && ci !== 'false') return 'plain';
  return isTty ? 'rich' : 'plain';
}

/** Reports whether a string names a style the flag accepts. */
function isStyleSetting(value: string): value is StyleSetting {
  return ACCEPTED_SETTINGS.has(value);
}
