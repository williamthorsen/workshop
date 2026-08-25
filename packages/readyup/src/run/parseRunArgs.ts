import { parseArgs as nodeParseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { usageError } from '../errors/RdyError.ts';
import type { Severity } from '../kits/types.ts';
import type { JsonDetail } from '../schemas/reportSchema.ts';
import { type KitSpecifier, parseKitSpecifiers } from './parseKitSpecifiers.ts';
import { validateRunFlags } from './validateRunFlags.ts';

/** The run-subcommand flags and positionals, parsed and validated. */
export interface ParsedRunArgs {
  checklists: string[] | undefined;
  detail?: JsonDetail;
  diagnose: boolean;
  failOn?: Severity;
  filePath: string | undefined;
  fromValue: string | undefined;
  internal: boolean;
  jit: boolean;
  json: boolean;
  kitSpecifiers: KitSpecifier[];
  packages: boolean;
  quiet: boolean;
  reportOn?: Severity;
  urlValue: string | undefined;
}

/** Valid severity values for CLI flag validation. */
const VALID_SEVERITIES = new Set<string>(['error', 'warn', 'recommend']);

/**
 * Options accepted by the `run` subcommand.
 *
 * A letter takes a short flag only when it has no dominant conflicting meaning in comparable
 * tools and means one thing across every `rdy` subcommand. The second clause is why `-f` is
 * `--file` here and nothing anywhere else. Pairs differing only by case are barred outright: a
 * shift-key slip must not be able to change what runs.
 */
const runOptions = {
  checklists: { type: 'string', short: 'c' },
  detail: { type: 'string' },
  diagnose: { type: 'boolean' },
  'fail-on': { type: 'string' },
  file: { type: 'string', short: 'f' },
  from: { type: 'string' },
  internal: { type: 'boolean' },
  jit: { type: 'boolean' },
  json: { type: 'boolean' },
  packages: { type: 'boolean' },
  quiet: { type: 'boolean' },
  'report-on': { type: 'string' },
  // Declared so strict parsing accepts it; `routeCommand` consumed its value before dispatch.
  style: { type: 'string' },
  url: { type: 'string' },
} as const;

/** Guidance shown for every spelling of `--checklists` that names no checklist. */
const CHECKLISTS_HINT = '--checklists requires a comma-separated list of checklist names';

/** Maps generic "requires a value" errors to domain-specific hints for run-subcommand flags. */
const flagErrorHints: Record<string, string> = {
  '--checklists': CHECKLISTS_HINT,
  '--detail': '--detail requires a projection (summary, full)',
  '--fail-on': '--fail-on requires a severity level (error, warn, recommend)',
  '--file': '--file requires a path argument',
  '--from': '--from requires a source argument (path, github:org/repo, npm:package, global, dir:path)',
  '--report-on': '--report-on requires a severity level (error, warn, recommend)',
  '--url': '--url requires a URL argument',
};

/** Parses run-subcommand flags into a structured object. */
export function parseRunArgs(flags: string[]): ParsedRunArgs {
  const { values, positionals } = parseRunFlags(flags);

  // parseArgs accepts `--flag=` as an empty string; the CLI treats an empty value as missing.
  for (const [name, value] of Object.entries(values)) {
    if (value === '') {
      const flag = `--${name}`;
      throw usageError(flagErrorHints[flag] ?? `${flag} requires a value`);
    }
  }

  const parsed = {
    checklists: values.checklists,
    detail: values.detail,
    diagnose: values.diagnose === true,
    file: values.file,
    from: values.from,
    internal: values.internal === true,
    jit: values.jit === true,
    json: values.json === true,
    packages: values.packages === true,
    quiet: values.quiet === true,
    url: values.url,
    failOn: values['fail-on'],
    reportOn: values['report-on'],
  };

  // Parse kit specifiers from positional args. This precedes validation because `--checklists`
  // is constrained by how many kits were named and whether the one named has its own filter.
  let kitSpecifiers: KitSpecifier[];
  try {
    kitSpecifiers = parseKitSpecifiers(positionals);
  } catch (error: unknown) {
    throw usageError(describeError(error), { cause: error });
  }

  validateRunFlags(parsed, kitSpecifiers);

  // Parse checklists from the flag value. An empty list selects every checklist, so a value that
  // names none — `,,,` — would invert what an explicit filter asks for.
  const checklists = parsed.checklists !== undefined ? parsed.checklists.split(',').filter((s) => s !== '') : undefined;
  if (checklists?.length === 0) {
    throw usageError(CHECKLISTS_HINT);
  }

  // Validate severity and projection flags.
  const failOn = parsed.failOn !== undefined ? parseSeverityFlag('--fail-on', parsed.failOn) : undefined;
  const reportOn = parsed.reportOn !== undefined ? parseSeverityFlag('--report-on', parsed.reportOn) : undefined;
  const detail = parsed.detail !== undefined ? parseDetailFlag(parsed.detail) : undefined;

  const parsedArgs: ParsedRunArgs = {
    checklists,
    diagnose: parsed.diagnose,
    filePath: parsed.file,
    fromValue: parsed.from,
    internal: parsed.internal,
    jit: parsed.jit,
    json: parsed.json,
    kitSpecifiers,
    packages: parsed.packages,
    quiet: parsed.quiet,
    urlValue: parsed.url,
  };
  if (detail !== undefined) parsedArgs.detail = detail;
  if (failOn !== undefined) parsedArgs.failOn = failOn;
  if (reportOn !== undefined) parsedArgs.reportOn = reportOn;
  return parsedArgs;
}

// region | Helpers

/** Validates and narrows a string to a detail projection. */
function parseDetailFlag(value: string): JsonDetail {
  if (value === 'full' || value === 'summary') return value;
  throw usageError(`--detail must be one of: summary, full (got "${value}")`);
}

/** Tokenizes run-subcommand flags via node:util.parseArgs, translating parse errors into domain-specific messages. */
function parseRunFlags(flags: string[]) {
  try {
    return nodeParseArgs({ args: flags, options: runOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error, 'run', flagErrorHints), { cause: error });
  }
}

/** Validates and narrows a string to a Severity value. */
function parseSeverityFlag(flagName: string, value: string): Severity {
  if (!VALID_SEVERITIES.has(value)) {
    throw usageError(`${flagName} must be one of: error, warn, recommend (got "${value}")`);
  }
  if (value === 'error') return 'error';
  if (value === 'warn') return 'warn';
  return 'recommend';
}

// endregion | Helpers
