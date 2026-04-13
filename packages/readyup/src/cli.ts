import path from 'node:path';
import process from 'node:process';

import { buildKitFilename } from './buildKitFilename.ts';
import { loadRdyKit } from './config.ts';
import { formatCombinedSummary } from './formatCombinedSummary.ts';
import { formatJsonError } from './formatJsonError.ts';
import { formatJsonReport } from './formatJsonReport.ts';
import { loadRemoteKit, type LoadRemoteKitOptions } from './loadRemoteKit.ts';
import { parseArgs } from './parseArgs.ts';
import { type FromSource, parseFromValue } from './parseFromValue.ts';
import { type KitSpecifier, parseKitSpecifiers } from './parseKitSpecifiers.ts';
import { reportRdy, tallyResult } from './reportRdy.ts';
import { resolveGitHubToken } from './resolveGitHubToken.ts';
import { resolveRequestedNames } from './resolveRequestedNames.ts';
import { meetsThreshold, runRdy } from './runRdy.ts';
import type {
  ChecklistSummary,
  FixLocation,
  RdyChecklist,
  RdyKit,
  RdyReport,
  RdyStagedChecklist,
  Severity,
  SummaryCounts,
} from './types.ts';
import { extractMessage } from './utils/error-handling.ts';

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

const runFlagSchema = {
  checklists: { long: '--checklists', type: 'string' as const, short: '-c' },
  file: { long: '--file', type: 'string' as const, short: '-f' },
  from: { long: '--from', type: 'string' as const },
  url: { long: '--url', type: 'string' as const, short: '-u' },
  jit: { long: '--jit', type: 'boolean' as const, short: '-J' },
  internal: { long: '--internal', type: 'boolean' as const, short: '-i' },
  json: { long: '--json', type: 'boolean' as const, short: '-j' },
  failOn: { long: '--fail-on', type: 'string' as const, short: '-F' },
  reportOn: { long: '--report-on', type: 'string' as const, short: '-R' },
};

/** Validate and narrow a string to a Severity value. */
function parseSeverityFlag(flagName: string, value: string): Severity {
  if (!VALID_SEVERITIES.has(value)) {
    throw new Error(`${flagName} must be one of: error, warn, recommend (got "${value}")`);
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

/** Build the Bitbucket raw content URL for a kit. */
function buildBitbucketKitUrl(workspace: string, repo: string, ref: string, kit: string, extension: string): string {
  return `https://bitbucket.org/${workspace}/${repo}/raw/${ref}/${KITS_DIR}/${kit}${extension}`;
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

/** Translate generic parseArgs errors into domain-specific messages where applicable. */
function translateParseError(error: unknown): never {
  if (error instanceof Error) {
    const match = error.message.match(/^(--\S+) requires a value$/);
    if (match?.[1] !== undefined) {
      const hint = flagErrorHints[match[1]];
      if (hint !== undefined) {
        throw new Error(hint);
      }
    }
  }
  throw error;
}

/** Collect active source flags and validate mutual exclusivity and mode-flag constraints. */
function validateFlagConstraints(
  parsed: {
    file: string | undefined;
    from: string | undefined;
    url: string | undefined;
    jit: boolean;
    internal: boolean;
    checklists: string | undefined;
  },
  positionalCount: number,
): string | undefined {
  const sourceFlags: string[] = [];
  if (parsed.file !== undefined) sourceFlags.push('--file');
  if (parsed.from !== undefined) sourceFlags.push('--from');
  if (parsed.url !== undefined) sourceFlags.push('--url');

  if (sourceFlags.length > 1) {
    throw new Error(`Cannot combine ${sourceFlags.join(', ')} flags`);
  }

  const sourceType = sourceFlags[0];

  if (parsed.jit && sourceType !== undefined) {
    throw new Error(`--jit cannot be combined with ${sourceType}`);
  }
  if (parsed.internal && sourceType !== undefined) {
    throw new Error(`--internal cannot be combined with ${sourceType}`);
  }

  if (parsed.checklists !== undefined && sourceType !== '--file' && sourceType !== '--url') {
    throw new Error('--checklists can only be used with --file or --url');
  }

  if ((sourceType === '--file' || sourceType === '--url') && positionalCount > 0) {
    throw new Error(`${sourceType} cannot be combined with positional kit arguments`);
  }

  return sourceType;
}

/** Parse run-subcommand flags into a structured object. */
export function parseRunArgs(flags: string[]): ParsedRunArgs {
  let result;
  try {
    result = parseArgs(flags, runFlagSchema);
  } catch (error: unknown) {
    translateParseError(error);
  }
  const { flags: parsed, positionals } = result;

  validateFlagConstraints(parsed, positionals.length);

  // Parse checklists from the flag value.
  const checklists = parsed.checklists !== undefined ? parsed.checklists.split(',').filter((s) => s !== '') : undefined;

  // Parse kit specifiers from positional args.
  const kitSpecifiers = parseKitSpecifiers(positionals);

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
  internalDir: string;
  internalInfix: string | undefined;
}): ResolvedKitEntry[] {
  if (filePath !== undefined) {
    return [{ name: filePath, source: { path: filePath }, checklists: checklists ?? [] }];
  }
  if (urlValue !== undefined) {
    return [{ name: urlValue, source: { url: urlValue }, checklists: checklists ?? [] }];
  }

  // Assume `jit` is always false when `fromValue` is present; `parseRunArgs` enforces this constraint.
  const extension = jit ? '.ts' : '.js';
  const specs = kitSpecifiers.length > 0 ? kitSpecifiers : [{ kitName: 'default', checklists: [] }];

  if (fromValue !== undefined) {
    return resolveFromSource(parseFromValue(fromValue), specs, extension);
  }

  // Default/internal case: resolve from the current repo.
  if (internal) {
    return specs.map((spec) => ({
      name: spec.kitName,
      source: { path: path.join(KITS_DIR, internalDir, buildKitFilename(spec.kitName, internalInfix, extension)) },
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

/** Build a checklist summary from a report, filtering results by reporting threshold. */
function summarizeReport(name: string, report: RdyReport, reportOn: Severity): ChecklistSummary {
  const counts: SummaryCounts = {
    passed: 0,
    errors: 0,
    warnings: 0,
    recommendations: 0,
    blocked: 0,
    optional: 0,
    worstSeverity: null,
  };
  for (const r of report.results) {
    if (!meetsThreshold(r.severity, reportOn)) continue;
    tallyResult(counts, r);
  }
  return { name, ...counts, durationMs: report.durationMs };
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
async function loadKit(source: KitSource, isJit: boolean): Promise<RdyKit> {
  if ('url' in source) {
    const options: LoadRemoteKitOptions = { url: source.url };
    if (source.url.includes('raw.githubusercontent.com')) {
      const token = resolveGitHubToken();
      if (token !== undefined) {
        options.token = token;
      }
    }
    return loadRemoteKit(options);
  }

  try {
    return await loadRdyKit(source.path);
  } catch (error: unknown) {
    if (isJit && isModuleNotFoundError(error, 'readyup')) {
      throw new Error('Running from source requires readyup to be installed as a project dependency.');
    }
    throw error;
  }
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
    let kit: RdyKit;
    try {
      kit = await loadKit(entry.source, isJit);
    } catch (error: unknown) {
      const message = extractMessage(error);
      process.stdout.write(formatJsonError(message) + '\n');
      return 1;
    }

    const thresholds = resolveThresholds(kit, failOn, reportOn);
    let resolvedNames: string[];
    try {
      resolvedNames = resolveRequestedNames(entry.checklists, kit);
    } catch (error: unknown) {
      const message = extractMessage(error);
      process.stdout.write(formatJsonError(message) + '\n');
      return 1;
    }

    const checklistByName = new Map(kit.checklists.map((c) => [c.name, c]));
    const checklists = resolvedNames.flatMap((name) => {
      const checklist = checklistByName.get(name);
      return checklist !== undefined ? [checklist] : [];
    });

    const entries: Array<{ name: string; report: RdyReport }> = [];
    let kitPassed = true;

    try {
      for (const checklist of checklists) {
        const report = await runRdy(checklist, {
          defaultSeverity: thresholds.defaultSeverity,
          failOn: thresholds.failOn,
        });
        entries.push({ name: checklist.name, report });
        if (!report.passed) kitPassed = false;
      }
    } catch (error: unknown) {
      const message = extractMessage(error);
      process.stdout.write(formatJsonError(message) + '\n');
      return 1;
    }

    kitResults.push({ name: entry.name, entries, passed: kitPassed });
  }

  const resolvedReportOn = reportOn ?? 'recommend';
  process.stdout.write(formatJsonReport(kitResults, { reportOn: resolvedReportOn }) + '\n');
  const allPassed = kitResults.every((k) => k.passed);
  return allPassed ? 0 : 1;
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
    let kit: RdyKit;
    try {
      kit = await loadKit(entry.source, isJit);
    } catch (error: unknown) {
      const message = extractMessage(error);
      process.stderr.write(`Error: ${message}\n`);
      return 1;
    }

    if (showKitHeader) {
      process.stdout.write(`\n=== ${entry.name} ===\n`);
    }

    const exitCode = await runSingleKitHumanMode(kit, entry.checklists, failOn, reportOn, showKitHeader);
    if (exitCode !== 0) allPassed = false;
  }

  return allPassed ? 0 : 1;
}

/** Run checklists from a single kit in human-readable mode. */
async function runSingleKitHumanMode(
  kit: RdyKit,
  checklistFilter: string[],
  failOn: Severity | undefined,
  reportOn: Severity | undefined,
  isMultiKit: boolean,
): Promise<number> {
  let resolvedNames: string[];
  try {
    resolvedNames = resolveRequestedNames(checklistFilter, kit);
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const checklistByName = new Map(kit.checklists.map((c) => [c.name, c]));
  const checklists = resolvedNames.flatMap((name) => {
    const checklist = checklistByName.get(name);
    return checklist !== undefined ? [checklist] : [];
  });

  const thresholds = resolveThresholds(kit, failOn, reportOn);
  const showChecklistHeader = checklists.length > 1;
  let allPassed = true;
  const summaries: ChecklistSummary[] = [];

  try {
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
        summaries.push(summarizeReport(checklist.name, report, thresholds.reportOn));
      }
    }
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  if (summaries.length > 1 && !isMultiKit) {
    process.stdout.write('\n' + formatCombinedSummary(summaries) + '\n');
  }

  return allPassed ? 0 : 1;
}
