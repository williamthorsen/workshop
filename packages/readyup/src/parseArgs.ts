/** Schema entry describing a single CLI flag. */
export interface FlagDefinition {
  long: string;
  type: 'boolean' | 'string';
  short?: string;
}

/** Map of camelCase property names to their flag definitions. */
export type FlagSchema = Record<string, FlagDefinition>;

/** Infer the result type from a flag schema: booleans become `boolean`, strings become `string | undefined`. */
export type ParsedFlags<S extends FlagSchema> = {
  [K in keyof S]: S[K]['type'] extends 'boolean' ? boolean : string | undefined;
};

/** Return type of `parseArgs`: typed flags plus collected positionals. */
export interface ParsedArgs<S extends FlagSchema> {
  flags: ParsedFlags<S>;
  positionals: string[];
}

/** Handle a `--flag=value` argument, returning the key and value to assign. */
function handleEqualsForm(
  arg: string,
  eqIndex: number,
  longToKey: Map<string, string>,
  definitions: Map<string, FlagDefinition>,
): { key: string; value: string } {
  const longFlag = arg.slice(0, eqIndex);
  const key = longToKey.get(longFlag);
  if (key === undefined) {
    throw new Error(`unknown flag '${longFlag}'`);
  }
  const def = definitions.get(key);
  if (def?.type === 'boolean') {
    throw new Error(`flag '${longFlag}' does not accept a value`);
  }
  const value = arg.slice(eqIndex + 1);
  if (value === '') {
    throw new Error(`${longFlag} requires a value`);
  }
  return { key, value };
}

/** Handle a bare `--flag` or `-f` argument, returning the key, value, and index advancement. */
function handleBareFlag(
  arg: string,
  index: number,
  argv: string[],
  longToKey: Map<string, string>,
  shortToKey: Map<string, string>,
  definitions: Map<string, FlagDefinition>,
): { key: string; value: boolean | string; advance: number } {
  const key = longToKey.get(arg) ?? shortToKey.get(arg);
  if (key === undefined) {
    throw new Error(`unknown flag '${arg}'`);
  }
  const def = definitions.get(key);
  if (def?.type === 'boolean') {
    return { key, value: true, advance: 0 };
  }
  // String flag: consume next argument as value.
  const next = argv[index + 1];
  if (next === undefined || (next.startsWith('-') && next !== '-')) {
    throw new Error(`${def?.long} requires a value`);
  }
  return { key, value: next, advance: 1 };
}

/**
 * Build the lookup tables needed for flag resolution from a schema.
 *
 * Returns maps from long/short forms to schema keys, and from schema keys to definitions.
 */
function buildLookupTables(schema: FlagSchema): {
  longToKey: Map<string, string>;
  shortToKey: Map<string, string>;
  definitions: Map<string, FlagDefinition>;
} {
  const longToKey = new Map<string, string>();
  const shortToKey = new Map<string, string>();
  const definitions = new Map<string, FlagDefinition>();

  for (const [key, def] of Object.entries(schema)) {
    longToKey.set(def.long, key);
    definitions.set(key, def);
    if (def.short !== undefined) {
      shortToKey.set(def.short, key);
    }
  }

  return { longToKey, shortToKey, definitions };
}

/**
 * Internal implementation that works with untyped records.
 *
 * Separated from the public API to isolate the dynamic key manipulation
 * from the generic type boundary.
 */
function parseArgsInternal(
  argv: string[],
  schema: FlagSchema,
): { flags: Record<string, boolean | string | undefined>; positionals: string[] } {
  const { longToKey, shortToKey, definitions } = buildLookupTables(schema);

  const flags: Record<string, boolean | string | undefined> = {};
  for (const [key, def] of Object.entries(schema)) {
    flags[key] = def.type === 'boolean' ? false : undefined;
  }

  const positionals: string[] = [];
  let pastDelimiter = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';

    if (pastDelimiter) {
      positionals.push(arg);
      continue;
    }

    if (arg === '--') {
      pastDelimiter = true;
      continue;
    }

    // Check for --long=value form.
    const eqIndex = arg.indexOf('=');
    if (eqIndex !== -1 && arg.startsWith('--')) {
      const { key, value } = handleEqualsForm(arg, eqIndex, longToKey, definitions);
      flags[key] = value;
      continue;
    }

    // Check for --long or -short form.
    if (arg.startsWith('-') && arg !== '-') {
      const { key, value, advance } = handleBareFlag(arg, i, argv, longToKey, shortToKey, definitions);
      flags[key] = value;
      i += advance;
      continue;
    }

    // Positional (includes bare `-`).
    positionals.push(arg);
  }

  return { flags, positionals };
}

/**
 * Parse a pre-sliced argv array against a flag schema.
 *
 * Throws `Error` with a human-readable message on unknown flags or missing string-flag values.
 * Does not call `console` or `process.exit`.
 */
export function parseArgs<S extends FlagSchema>(argv: string[], schema: S): ParsedArgs<S> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- The internal parser works with dynamic keys; the generic return type is guaranteed by schema-driven initialization.
  return parseArgsInternal(argv, schema) as ParsedArgs<S>;
}

/**
 * Translate a `parseArgs` error into a user-facing message.
 *
 * Rewrites the internal `"unknown flag '--x'"` format to `"Unknown option: --x"`;
 * passes other messages through unchanged.
 */
export function translateParseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const flagMatch = message.match(/^unknown flag '(.+)'$/);
  if (flagMatch?.[1] !== undefined) {
    return `Unknown option: ${flagMatch[1]}`;
  }
  return message;
}
