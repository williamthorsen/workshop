import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { buildKitFilename } from './buildKitFilename.ts';
import { type LoadedRdyKit, loadRdyKit } from './config.ts';
import { kitLoadError, usageError } from './errors.ts';
import { EXIT_OK, EXIT_PROBLEMS_FOUND } from './exitCodes.ts';
import { formatCombinedSummary } from './formatCombinedSummary.ts';
import { formatJsonReport } from './formatJsonReport.ts';
import { loadRemoteKit, type LoadRemoteKitOptions } from './loadRemoteKit.ts';
import { type FromSource, parseFromValue } from './parseFromValue.ts';
import { type KitSpecifier, parseKitSpecifiers } from './parseKitSpecifiers.ts';
import { countResults, reportRdy } from './reportRdy.ts';
import { resolveBitbucketToken } from './resolveBitbucketToken.ts';
import { resolveGitHubToken } from './resolveGitHubToken.ts';
import { resolveRequestedNames } from './resolveRequestedNames.ts';
import { runRdy } from './runRdy.ts';
import type {
  ChecklistSummary,
  FixLocation,
  RdyChecklist,
  RdyKit,
  RdyReport,
  RdyStagedChecklist,
  Severity,
} from './types.ts';
import { extractMessage } from './utils/error-handling.ts';
import { translateParseArgsError } from './utils/parse-args-error.ts';
import { VERSION } from './version.ts';
import { compareVersionsForSkew } from './versionSkew/compareVersionsForSkew.ts';

/** Valid severity values for CLI flag validation. */
const VALID_SEVERITIES = new Set<string>(['error', 'warn', 'recommend']);

/** Discriminated union describing how to locate the rdy kit. */
export type KitSource = { path: string } | { url: string };

/** A resolved kit entry with its source and checklist filter. */
export interface ResolvedKitEntry {
  name: string;
  source: KitSource;
  checklists: string[];
}

export interface ParsedRunArgs {
  checklists: string[] | undefined;
  failOn?: Severity;
  filePath: string | undefined;
  fromValue: string | undefined;
  internal: boolean;
  jit: boolean;
  json: boolean;
  kitSpecifiers: KitSpecifier[];
  reportOn?: Severity;
  urlValue: string | undefined;
}

/**
 * Options accepted by the `run` subcommand.
 *
 * A letter earns a short flag only when it carries no dominant conflicting meaning in comparable
 * tools and means one thing across every `rdy` subcommand. The second clause is why `-f` is
 * `--file` here and nothing anywhere else. The retired rule — first letter, uppercased on
 * collision — manufactured `-j`/`-J` and `-f`/`-F`, pairs differing only by case where a typo
 * silently changed what ran.
 */
const runOptions = {
  checklists: { type: 'string', short: 'c' },
  'fail-on': { type: 'string' },
  file: { type: 'string', short: 'f' },
  from: { type: 'string' },
  internal: { type: 'boolean' },
  jit: { type: 'boolean' },
  json: { type: 'boolean' },
  'report-on': { type: 'string' },
  url: { type: 'string' },
} as const;

/** Validate and narrow a string to a Severity value. */
function parseSeverityFlag(flagName: string, value: string): Severity {
  if (!VALID_SEVERITIES.has(value)) {
    throw usageError(`${flagName} must be one of: error, warn, recommend (got "${value}")`);
  }
  if (value === 'error') return 'error';
  if (value === 'warn') return 'warn';
  return 'recommend';
}

/** Convention path for internal kits, relative to the repo root. */
const KITS_DIR = '.readyup/kits';

/** Build the GitHub raw content URL for a kit. */
function buildGitHubKitUrl(org: string, repo: string, ref: string, kit: string, extension: string): string {
  return `https://raw.githubusercontent.com/${org}/${repo}/${ref}/${KITS_DIR}/${kit}${extension}`;
}

/** Build the Bitbucket Cloud API source URL for a kit. */
function buildBitbucketKitUrl(workspace: string, repo: string, ref: string, kit: string, extension: string): string {
  return `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${ref}/${KITS_DIR}/${kit}${extension}`;
}

/** Map generic "requires a value" errors to domain-specific hints for run-subcommand flags. */
const flagErrorHints: Record<string, string> = {
  '--checklists': '--checklists requires a comma-separated list of checklist names',
  '--fail-on': '--fail-on requires a severity level (error, warn, recommend)',
  '--file': '--file requires a path argument',
  '--from': '--from requires a source argument (path, github:org/repo, global, dir:path)',
  '--report-on': '--report-on requires a severity level (error, warn, recommend)',
  '--url': '--url requires a URL argument',
};

/** The subset of parsed run flags whose combinations are constrained. */
interface RunFlagConstraints {
  checklists: string | undefined;
  file: string | undefined;
  from: string | undefined;
  internal: boolean;
  jit: boolean;
  url: string | undefined;
}

/** Collects the active source flags and enforces mutual exclusivity, mode-flag, and selection constraints. */
function validateFlagConstraints(parsed: RunFlagConstraints, kitSpecifiers: KitSpecifier[]): string | undefined {
  const sourceFlags: string[] = [];
  if (parsed.file !== undefined) sourceFlags.push('--file');
  if (parsed.from !== undefined) sourceFlags.push('--from');
  if (parsed.url !== undefined) sourceFlags.push('--url');

  if (sourceFlags.length > 1) {
    throw usageError(`Cannot combine ${sourceFlags.join(', ')} flags`);
  }

  const sourceType = sourceFlags[0];

  if (parsed.jit && sourceType !== undefined) {
    throw usageError(`--jit cannot be combined with ${sourceType}`);
  }
  if (parsed.internal && sourceType !== undefined) {
    throw usageError(`--internal cannot be combined with ${sourceType}`);
  }

  if ((sourceType === '--file' || sourceType === '--url') && kitSpecifiers.length > 0) {
    throw usageError(`${sourceType} cannot be combined with positional kit arguments`);
  }

  if (parsed.checklists !== undefined) {
    validateChecklistsSelection(sourceType, kitSpecifiers);
  }

  return sourceType;
}

/**
 * Rejects `--checklists` when the selection it expresses is ambiguous.
 *
 * The flag names checklists within one kit, so it needs exactly one kit and no competing per-kit
 * filter. `--file` and `--url` each name their one kit implicitly; a bare invocation names the
 * default kit. Conflicting selections error rather than merging: an invocation carrying both is a
 * bug in whatever generated it, and no merge rule for "run `deploy:build`, filtered to `test`" is
 * obviously right.
 */
function validateChecklistsSelection(sourceType: string | undefined, kitSpecifiers: KitSpecifier[]): void {
  if (sourceType === '--file' || sourceType === '--url') return;

  if (kitSpecifiers.length > 1) {
    const names = kitSpecifiers.map((spec) => spec.kitName).join(', ');
    throw usageError(`--checklists requires a single kit, but ${kitSpecifiers.length} were given: ${names}`);
  }

  const spec = kitSpecifiers[0];
  if (spec !== undefined && spec.checklists.length > 0) {
    throw usageError(`--checklists cannot be combined with the ":" checklist filter on "${spec.kitName}"`);
  }
}

/** Tokenize run-subcommand flags via node:util.parseArgs, translating parse errors into domain-specific messages. */
function parseRunFlags(flags: string[]) {
  try {
    return nodeParseArgs({ args: flags, options: runOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error, flagErrorHints), { cause: error });
  }
}

/** Parse run-subcommand flags into a structured object. */
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
    file: values.file,
    from: values.from,
    internal: values.internal === true,
    jit: values.jit === true,
    json: values.json === true,
    url: values.url,
    failOn: values['fail-on'],
    reportOn: values['report-on'],
  };

  // Parse kit specifiers from positional args. This precedes validation because `--checklists`
  // is constrained by how many kits were named and whether the one named carries its own filter.
  let kitSpecifiers: KitSpecifier[];
  try {
    kitSpecifiers = parseKitSpecifiers(positionals);
  } catch (error: unknown) {
    throw usageError(extractMessage(error), { cause: error });
  }

  validateFlagConstraints(parsed, kitSpecifiers);

  // Parse checklists from the flag value.
  const checklists = parsed.checklists !== undefined ? parsed.checklists.split(',').filter((s) => s !== '') : undefined;

  // Validate severity flags.
  const failOn = parsed.failOn !== undefined ? parseSeverityFlag('--fail-on', parsed.failOn) : undefined;
  const reportOn = parsed.reportOn !== undefined ? parseSeverityFlag('--report-on', parsed.reportOn) : undefined;

  const parsedArgs: ParsedRunArgs = {
    checklists,
    filePath: parsed.file,
    fromValue: parsed.from,
    internal: parsed.internal,
    jit: parsed.jit,
    json: parsed.json,
    kitSpecifiers,
    urlValue: parsed.url,
  };
  if (failOn !== undefined) parsedArgs.failOn = failOn;
  if (reportOn !== undefined) parsedArgs.reportOn = reportOn;
  return parsedArgs;
}

/** Resolve parsed flags into an array of kit entries to execute. */
export function resolveKitSources({
  filePath,
  fromValue,
  urlValue,
  kitSpecifiers,
  checklists,
  jit,
  internal,
  internalDir,
  internalInfix,
}: {
  filePath: string | undefined;
  fromValue: string | undefined;
  urlValue: string | undefined;
  kitSpecifiers: KitSpecifier[];
  checklists: string[] | undefined;
  jit: boolean;
  internal: boolean;
  internalDir?: string | undefined;
  internalInfix?: string | undefined;
}): ResolvedKitEntry[] {
  if (filePath !== undefined) {
    return [{ name: filePath, source: { path: filePath }, checklists: checklists ?? [] }];
  }
  if (urlValue !== undefined) {
    return [{ name: urlValue, source: { url: urlValue }, checklists: checklists ?? [] }];
  }

  // Assume `jit` is always false when `fromValue` is present; `parseRunArgs` enforces this constraint.
  const extension = jit ? '.ts' : '.js';
  const declaredSpecs = kitSpecifiers.length > 0 ? kitSpecifiers : [{ kitName: 'default', checklists: [] }];
  // `--checklists` names checklists within one kit, and `parseRunArgs` has already rejected every
  // invocation where "one kit" is ambiguous, so this map never covers more than a single spec.
  const specs = checklists === undefined ? declaredSpecs : declaredSpecs.map((spec) => ({ ...spec, checklists }));

  if (fromValue !== undefined) {
    let source: FromSource;
    try {
      source = parseFromValue(fromValue);
    } catch (error: unknown) {
      throw usageError(extractMessage(error), { cause: error });
    }
    return resolveFromSource(source, specs, extension);
  }

  // Default/internal case: resolve from the current repo.
  if (internal) {
    return specs.map((spec) => ({
      name: spec.kitName,
      source: {
        path: path.join(KITS_DIR, internalDir ?? '.', buildKitFilename(spec.kitName, internalInfix, extension)),
      },
      checklists: spec.checklists,
    }));
  }

  return specs.map((spec) => ({
    name: spec.kitName,
    source: { path: path.join(KITS_DIR, `${spec.kitName}${extension}`) },
    checklists: spec.checklists,
  }));
}

/** Resolve kit entries from a parsed `--from` source. */
function resolveFromSource(source: FromSource, specs: KitSpecifier[], extension: string): ResolvedKitEntry[] {
  switch (source.type) {
    case 'github':
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { url: buildGitHubKitUrl(source.org, source.repo, source.ref, spec.kitName, extension) },
        checklists: spec.checklists,
      }));

    case 'bitbucket':
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { url: buildBitbucketKitUrl(source.workspace, source.repo, source.ref, spec.kitName, extension) },
        checklists: spec.checklists,
      }));

    case 'global': {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(homeDir, KITS_DIR, `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
      }));
    }

    case 'directory':
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(path.resolve(process.cwd(), source.path), `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
      }));

    case 'local': {
      const resolvedBase = path.resolve(process.cwd(), source.path);
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(resolvedBase, KITS_DIR, `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
      }));
    }
  }
}

/** Resolve the effective fixLocation for a checklist, falling back to the kit-level default. */
function resolveFixLocation(checklist: RdyChecklist | RdyStagedChecklist, kitDefault?: FixLocation): FixLocation {
  return checklist.fixLocation ?? kitDefault ?? 'end';
}

/** Build a checklist summary from a report. */
function summarizeReport(name: string, report: RdyReport): ChecklistSummary {
  return { name, ...countResults(report.results), durationMs: report.durationMs };
}

/** Resolve threshold values from the cascade: CLI flag > kit field > default. */
function resolveThresholds(
  kit: RdyKit,
  cliFailOn: Severity | undefined,
  cliReportOn: Severity | undefined,
): { defaultSeverity: Severity; failOn: Severity; reportOn: Severity } {
  return {
    defaultSeverity: kit.defaultSeverity ?? 'error',
    failOn: cliFailOn ?? kit.failOn ?? 'error',
    reportOn: cliReportOn ?? kit.reportOn ?? 'recommend',
  };
}

interface RunCommandOptions {
  kitEntries: ResolvedKitEntry[];
  json: boolean;
  failOn?: Severity;
  reportOn?: Severity;
}

/** Load a rdy kit from a path or URL source. */
async function loadKit(source: KitSource, isJit: boolean): Promise<LoadedRdyKit> {
  if ('url' in source) {
    const options: LoadRemoteKitOptions = { url: source.url };
    if (source.url.includes('raw.githubusercontent.com')) {
      const token = resolveGitHubToken();
      if (token !== undefined) {
        options.headers = { Authorization: `token ${token}` };
      }
    } else if (source.url.includes('api.bitbucket.org')) {
      const token = resolveBitbucketToken();
      if (token !== undefined) {
        options.headers = { Authorization: `Bearer ${token}` };
      }
    }

    try {
      return await loadRemoteKit(options);
    } catch (error: unknown) {
      const message = extractMessage(error);
      // Network failures (raw `fetch` rejections) carry no URL context; thrown errors from `loadRemoteKit` already include the URL.
      const detail = message.includes(source.url) ? message : `Failed to reach ${source.url}: ${message}`;
      throw kitLoadError(detail, { cause: error });
    }
  }

  try {
    return await loadRdyKit(source.path);
  } catch (error: unknown) {
    if (isJit && isModuleNotFoundError(error, 'readyup')) {
      throw kitLoadError('Running from source requires readyup to be installed as a project dependency.', {
        cause: error,
      });
    }
    throw kitLoadError(extractMessage(error), { cause: error });
  }
}

/**
 * Emit a directional, advisory stderr warning when a kit's compile-time readyup version skews
 * from the runner's version above the leftmost-non-zero boundary.
 *
 * Silent when the compile-time version is absent (older kit, third-party `--url` source, or
 * uncompiled `.ts` source via `--jit`) and when the comparator returns no-skew.
 */
function warnOnVersionSkew(kitName: string, compileTimeVersion: string | undefined): void {
  if (compileTimeVersion === undefined) return;
  const result = compareVersionsForSkew(compileTimeVersion, VERSION);
  if (result.kind === 'no-skew') return;
  const remedy = result.direction === 'runner-newer' ? 'Run `rdy compile` to refresh.' : 'Upgrade readyup to match.';
  process.stderr.write(
    `Warning: kit "${kitName}" was compiled against readyup ${compileTimeVersion}; runner is ${VERSION}. ${remedy}\n`,
  );
}

/** Detect module-not-found errors that mention a specific package name. */
function isModuleNotFoundError(error: unknown, packageName: string): boolean {
  if (!(error instanceof Error)) return false;
  if (!('code' in error)) return false;
  if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_MODULE_NOT_FOUND') return false;
  return error.message.includes(packageName);
}

/** Run rdy checklists across one or more kits. Returns a numeric exit code. */
export async function runCommand(
  { kitEntries, json, failOn, reportOn }: RunCommandOptions,
  isJit = false,
): Promise<number> {
  if (json) {
    return runMultiKitJsonMode(kitEntries, failOn, reportOn, isJit);
  }
  return runMultiKitHumanMode(kitEntries, failOn, reportOn, isJit);
}

/** Run all kit entries in JSON mode, producing a single JSON report. */
async function runMultiKitJsonMode(
  kitEntries: ResolvedKitEntry[],
  failOn: Severity | undefined,
  reportOn: Severity | undefined,
  isJit: boolean,
): Promise<number> {
  const kitResults: Array<{
    name: string;
    entries: Array<{ name: string; report: RdyReport }>;
    passed: boolean;
  }> = [];

  for (const entry of kitEntries) {
    const { kit, compileTimeVersion } = await loadKit(entry.source, isJit);

    warnOnVersionSkew(entry.name, compileTimeVersion);

    const thresholds = resolveThresholds(kit, failOn, reportOn);
    const checklists = selectChecklists(kit, entry.checklists);

    const entries: Array<{ name: string; report: RdyReport }> = [];
    let kitPassed = true;

    for (const checklist of checklists) {
      const report = await runRdy(checklist, {
        defaultSeverity: thresholds.defaultSeverity,
        failOn: thresholds.failOn,
      });
      entries.push({ name: checklist.name, report });
      if (!report.passed) kitPassed = false;
    }

    kitResults.push({ name: entry.name, entries, passed: kitPassed });
  }

  const resolvedReportOn = reportOn ?? 'recommend';
  process.stdout.write(formatJsonReport(kitResults, { reportOn: resolvedReportOn }) + '\n');
  const allPassed = kitResults.every((k) => k.passed);
  return allPassed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/** Run all kit entries in human-readable mode. */
async function runMultiKitHumanMode(
  kitEntries: ResolvedKitEntry[],
  failOn: Severity | undefined,
  reportOn: Severity | undefined,
  isJit: boolean,
): Promise<number> {
  const showKitHeader = kitEntries.length > 1;
  let allPassed = true;
  for (const entry of kitEntries) {
    const { kit, compileTimeVersion } = await loadKit(entry.source, isJit);

    warnOnVersionSkew(entry.name, compileTimeVersion);

    if (showKitHeader) {
      process.stdout.write(`\n=== ${entry.name} ===\n`);
    }

    const exitCode = await runSingleKitHumanMode(kit, entry.checklists, failOn, reportOn, showKitHeader);
    if (exitCode !== EXIT_OK) allPassed = false;
  }

  return allPassed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/** Run checklists from a single kit in human-readable mode. */
async function runSingleKitHumanMode(
  kit: RdyKit,
  checklistFilter: string[],
  failOn: Severity | undefined,
  reportOn: Severity | undefined,
  isMultiKit: boolean,
): Promise<number> {
  const checklists = selectChecklists(kit, checklistFilter);
  const thresholds = resolveThresholds(kit, failOn, reportOn);
  const showChecklistHeader = checklists.length > 1;
  let allPassed = true;
  const summaries: ChecklistSummary[] = [];

  for (const checklist of checklists) {
    if (showChecklistHeader) {
      process.stdout.write(`\n--- ${checklist.name} ---\n\n`);
    }

    const report = await runRdy(checklist, {
      defaultSeverity: thresholds.defaultSeverity,
      failOn: thresholds.failOn,
    });
    const fixLocation = resolveFixLocation(checklist, kit.fixLocation);
    const output = reportRdy(report, { fixLocation, reportOn: thresholds.reportOn });
    process.stdout.write(output + '\n');

    if (!report.passed) {
      allPassed = false;
    }

    if (showChecklistHeader) {
      summaries.push(summarizeReport(checklist.name, report));
    }
  }

  if (summaries.length > 1 && !isMultiKit) {
    process.stdout.write('\n' + formatCombinedSummary(summaries) + '\n');
  }

  return allPassed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/** Resolves a kit's requested checklist names to the checklists themselves, in requested order. */
function selectChecklists(kit: RdyKit, checklistFilter: string[]): Array<RdyChecklist | RdyStagedChecklist> {
  let resolvedNames: string[];
  try {
    resolvedNames = resolveRequestedNames(checklistFilter, kit);
  } catch (error: unknown) {
    throw usageError(extractMessage(error), { cause: error });
  }

  const checklistByName = new Map(kit.checklists.map((c) => [c.name, c]));
  return resolvedNames.flatMap((name) => {
    const checklist = checklistByName.get(name);
    return checklist !== undefined ? [checklist] : [];
  });
}
