import { describeError } from '@williamthorsen/toolbelt.errors';

import { parseSubcommandArgs } from '../bin/parseSubcommandArgs.ts';
import { usageError } from '../errors/RdyError.ts';
import { assertRelativeKitName } from '../kits/assertRelativeKitName.ts';
import type { Severity } from '../kits/types.ts';
import type { JsonDetail } from '../schemas/reportSchema.ts';
import { type KitSpecifier, parseKitSpecifiers } from './parseKitSpecifiers.ts';
import { validateRunFlags } from './validateRunFlags.ts';

/** The run-subcommand flags and positionals, parsed and validated. */
export interface ParsedRunArgs {
  all: boolean;
  checklists: string[] | undefined;
  configPath: string | undefined;
  detail?: JsonDetail;
  diagnose: boolean;
  failOn?: Severity;
  filePath: string | undefined;
  fromValue: string | undefined;
  internal: boolean;
  jit: boolean;
  isJson: boolean;
  kitSpecifiers: KitSpecifier[];
  noCache: boolean;
  quiet: boolean;
  reportOn?: Severity;
  sources: boolean;
  urlValue: string | undefined;
}

/** Valid severity values for CLI flag validation. */
const VALID_SEVERITIES = new Set<string>(['error', 'warn', 'recommend']);

/**
 * Options accepted by the `run` subcommand.
 *
 * A letter takes a short flag only when it has no dominant conflicting meaning in comparable
 * tools and means one thing across every `rdy` subcommand. The second clause is why `-f` is
 * `--file` here and nothing anywhere else. Pairs differing only by case are barred outright: A
 * shift-key slip must not be able to change what runs.
 */
const runOptions = {
  all: { type: 'boolean' },
  checklists: { type: 'string', short: 'c' },
  config: { type: 'string' },
  detail: { type: 'string' },
  diagnose: { type: 'boolean' },
  'fail-on': { type: 'string' },
  file: { type: 'string', short: 'f' },
  from: { type: 'string' },
  internal: { type: 'boolean' },
  jit: { type: 'boolean' },
  json: { type: 'boolean' },
  'no-cache': { type: 'boolean' },
  quiet: { type: 'boolean' },
  'report-on': { type: 'string' },
  sources: { type: 'boolean' },
  url: { type: 'string' },
} as const;

/** Guidance shown for every spelling of `--checklists` that names no checklist. */
const CHECKLISTS_HINT = '--checklists requires a comma-separated list of checklist names';

/** Maps generic "requires a value" errors to domain-specific hints for run-subcommand flags. */
const flagErrorHints: Record<string, string> = {
  '--checklists': CHECKLISTS_HINT,
  '--config': '--config requires a path argument',
  '--detail': '--detail requires a level of detail (summary, full)',
  '--fail-on': '--fail-on requires a severity level (error, warn, recommend)',
  '--file': '--file requires a path argument',
  '--from': '--from requires a source argument (path, github:org/repo, npm:package, global, dir:path)',
  '--report-on': '--report-on requires a severity level (error, warn, recommend)',
  '--url': '--url requires a URL argument',
};

/** Parses run-subcommand flags into a structured object. */
export function parseRunArgs(flags: string[]): ParsedRunArgs {
  const { values, positionals } = parseSubcommandArgs({
    args: flags,
    command: 'run',
    hints: flagErrorHints,
    options: runOptions,
  });

  const parsed = {
    all: values.all === true,
    checklists: values.checklists,
    config: values.config,
    detail: values.detail,
    diagnose: values.diagnose === true,
    file: values.file,
    from: values.from,
    internal: values.internal === true,
    jit: values.jit === true,
    isJson: values.json === true,
    noCache: values['no-cache'] === true,
    quiet: values.quiet === true,
    sources: values.sources === true,
    url: values.url,
    failOn: values['fail-on'],
    reportOn: values['report-on'],
  };

  // Parse kit specifiers from positional args. This precedes validation because `--checklists`
  // is constrained by how many kits were named and whether the one named has its own filter.
  let kitSpecifiers: KitSpecifier[];
  try {
    kitSpecifiers = parseKitSpecifiers(positionals);
    for (const spec of kitSpecifiers) assertRelativeKitName(spec.kitName);
  } catch (error: unknown) {
    throw usageError(describeError(error), { cause: error });
  }

  validateRunFlags(parsed, kitSpecifiers);

  // Parse checklists from the flag value. An empty list selects every checklist, so a value that
  // names none -- `,,,` -- would invert what an explicit filter asks for.
  const checklists = parsed.checklists !== undefined ? parsed.checklists.split(',').filter((s) => s !== '') : undefined;
  if (checklists?.length === 0) {
    throw usageError(CHECKLISTS_HINT);
  }

  // Validate severity and projection flags.
  const failOn = parsed.failOn !== undefined ? parseSeverityFlag('--fail-on', parsed.failOn) : undefined;
  const reportOn = parsed.reportOn !== undefined ? parseSeverityFlag('--report-on', parsed.reportOn) : undefined;
  const detail = parsed.detail !== undefined ? parseDetailFlag(parsed.detail) : undefined;

  const parsedArgs: ParsedRunArgs = {
    all: parsed.all,
    checklists,
    configPath: parsed.config,
    diagnose: parsed.diagnose,
    filePath: parsed.file,
    fromValue: parsed.from,
    internal: parsed.internal,
    jit: parsed.jit,
    isJson: parsed.isJson,
    kitSpecifiers,
    noCache: parsed.noCache,
    quiet: parsed.quiet,
    sources: parsed.sources,
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
