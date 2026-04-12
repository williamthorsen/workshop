import path from 'node:path';
import process from 'node:process';

import { loadRdyKit } from './config.ts';
import { formatCombinedSummary } from './formatCombinedSummary.ts';
import { formatJsonError } from './formatJsonError.ts';
import { formatJsonReport } from './formatJsonReport.ts';
import { loadRemoteKit, type LoadRemoteKitOptions } from './loadRemoteKit.ts';
import { parseArgs } from './parseArgs.ts';
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
  githubValue: string | undefined;
  json: boolean;
  kitSpecifiers: KitSpecifier[];
  localValue: string | undefined;
  reportOn?: Severity;
  urlValue: string | undefined;
}

const runFlagSchema = {
  checklists: { long: '--checklists', type: 'string' as const, short: '-c' },
  file: { long: '--file', type: 'string' as const, short: '-f' },
  github: { long: '--github', type: 'string' as const, short: '-g' },
  url: { long: '--url', type: 'string' as const, short: '-u' },
  local: { long: '--local', type: 'string' as const, short: '-l' },
  json: { long: '--json', type: 'boolean' as const, short: '-j' },
  failOn: { long: '--fail-on', type: 'string' as const, short: '-F' },
  reportOn: { long: '--report-on', type: 'string' as const, short: '-R' },
};

/** Throw if a kit source flag has already been set. */
function assertNoExistingSource(existing: string | undefined): void {
  if (existing !== undefined) {
    throw new Error('Cannot combine --file, --github, --local, and --url flags');
  }
}

/**
 * Parse `org/repo[@ref]` into repo and ref components.
 *
 * The `@ref` part is optional; defaults to `main`.
 */
function parseGitHubArg(value: string): { repo: string; ref: string } {
  const atIndex = value.lastIndexOf('@');
  if (atIndex === -1) {
    return { repo: value, ref: 'main' };
  }
  const repo = value.slice(0, atIndex);
  const ref = value.slice(atIndex + 1);
  if (ref === '') {
    throw new Error(`Invalid --github value: ref after '@' must not be empty in "${value}"`);
  }
  return { repo, ref };
}

/** Validate and narrow a string to a Severity value. */
function parseSeverityFlag(flagName: string, value: string): Severity {
  if (!VALID_SEVERITIES.has(value)) {
    throw new Error(`${flagName} must be one of: error, warn, recommend (got "${value}")`);
  }
  // Validated above; narrow without assertion by returning the matched literal.
  if (value === 'error') return 'error';
  if (value === 'warn') return 'warn';
  return 'recommend';
}

/** Convention path for internal kits, relative to the repo root. */
const KITS_DIR = '.rdy/kits';

/** Build the GitHub raw content URL for a kit. */
function buildGitHubKitUrl(repo: string, ref: string, kit: string): string {
  return `https://raw.githubusercontent.com/${repo}/${ref}/${KITS_DIR}/${kit}.js`;
}

/** Map generic "requires a value" errors to domain-specific hints for run-subcommand flags. */
const flagErrorHints: Record<string, string> = {
  '--checklists': '--checklists requires a comma-separated list of checklist names',
  '--fail-on': '--fail-on requires a severity level (error, warn, recommend)',
  '--file': '--file requires a path argument',
  '--github': '--github requires a repository argument (org/repo[@ref])',
  '--local': '--local requires a path to a local repository',
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

/** Parse run-subcommand flags into a structured object. */
export function parseRunArgs(flags: string[]): ParsedRunArgs {
  let result;
  try {
    result = parseArgs(flags, runFlagSchema);
  } catch (error: unknown) {
    translateParseError(error);
  }
  const { flags: parsed, positionals } = result;

  // Validate mutual exclusivity of source flags.
  let sourceType: string | undefined;
  if (parsed.file !== undefined) {
    assertNoExistingSource(sourceType);
    sourceType = 'file';
  }
  if (parsed.github !== undefined) {
    assertNoExistingSource(sourceType);
    sourceType = 'github';
  }
  if (parsed.local !== undefined) {
    assertNoExistingSource(sourceType);
    sourceType = 'local';
  }
  if (parsed.url !== undefined) {
    assertNoExistingSource(sourceType);
    sourceType = 'url';
  }

  // Validate --checklists co-dependencies.
  const checklistsValue = parsed.checklists;
  if (checklistsValue !== undefined && sourceType !== 'file' && sourceType !== 'url') {
    throw new Error('--checklists can only be used with --file or --url');
  }

  // Validate that file/url sources cannot be combined with positional args.
  if ((sourceType === 'file' || sourceType === 'url') && positionals.length > 0) {
    throw new Error(`--${sourceType} cannot be combined with positional kit arguments`);
  }

  // Parse checklists from the flag value.
  const checklists = checklistsValue !== undefined ? checklistsValue.split(',').filter((s) => s !== '') : undefined;

  // Parse kit specifiers from positional args.
  const kitSpecifiers = parseKitSpecifiers(positionals);

  // Validate severity flags.
  const failOn = parsed.failOn !== undefined ? parseSeverityFlag('--fail-on', parsed.failOn) : undefined;
  const reportOn = parsed.reportOn !== undefined ? parseSeverityFlag('--report-on', parsed.reportOn) : undefined;

  const parsedArgs: ParsedRunArgs = {
    checklists,
    filePath: parsed.file,
    githubValue: parsed.github,
    json: parsed.json,
    kitSpecifiers,
    localValue: parsed.local,
    urlValue: parsed.url,
  };
  if (failOn !== undefined) parsedArgs.failOn = failOn;
  if (reportOn !== undefined) parsedArgs.reportOn = reportOn;
  return parsedArgs;
}

/** Resolve parsed flags into an array of kit entries to execute. */
export function resolveKitSources({
  filePath,
  githubValue,
  localValue,
  urlValue,
  kitSpecifiers,
  checklists,
  internalDir,
  internalExtension,
}: {
  filePath: string | undefined;
  githubValue: string | undefined;
  localValue: string | undefined;
  urlValue: string | undefined;
  kitSpecifiers: KitSpecifier[];
  checklists: string[] | undefined;
  internalDir: string;
  internalExtension: string;
}): ResolvedKitEntry[] {
  if (filePath !== undefined) {
    return [{ name: filePath, source: { path: filePath }, checklists: checklists ?? [] }];
  }
  if (urlValue !== undefined) {
    return [{ name: urlValue, source: { url: urlValue }, checklists: checklists ?? [] }];
  }

  const specs = kitSpecifiers.length > 0 ? kitSpecifiers : [{ kitName: 'default', checklists: [] }];

  if (githubValue !== undefined) {
    const { repo, ref } = parseGitHubArg(githubValue);
    return specs.map((spec) => ({
      name: spec.kitName,
      source: { url: buildGitHubKitUrl(repo, ref, spec.kitName) },
      checklists: spec.checklists,
    }));
  }

  if (localValue !== undefined) {
    const resolvedBase = path.resolve(process.cwd(), localValue);
    return specs.map((spec) => ({
      name: spec.kitName,
      source: { path: path.join(resolvedBase, KITS_DIR, `${spec.kitName}.js`) },
      checklists: spec.checklists,
    }));
  }

  // Internal/default case.
  return specs.map((spec) => ({
    name: spec.kitName,
    source: { path: path.join(KITS_DIR, internalDir, `${spec.kitName}${internalExtension}`) },
    checklists: spec.checklists,
  }));
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
async function loadKit(source: KitSource): Promise<RdyKit> {
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
  return loadRdyKit(source.path);
}

/** Run rdy checklists across one or more kits. Returns a numeric exit code. */
export async function runCommand({ kitEntries, json, failOn, reportOn }: RunCommandOptions): Promise<number> {
  if (json) {
    return runMultiKitJsonMode(kitEntries, failOn, reportOn);
  }
  return runMultiKitHumanMode(kitEntries, failOn, reportOn);
}

/** Run all kit entries in JSON mode, producing a single JSON report. */
async function runMultiKitJsonMode(
  kitEntries: ResolvedKitEntry[],
  failOn: Severity | undefined,
  reportOn: Severity | undefined,
): Promise<number> {
  const kitResults: Array<{
    name: string;
    entries: Array<{ name: string; report: RdyReport }>;
    passed: boolean;
  }> = [];

  for (const entry of kitEntries) {
    let kit: RdyKit;
    try {
      kit = await loadKit(entry.source);
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
): Promise<number> {
  const showKitHeader = kitEntries.length > 1;
  let allPassed = true;
  for (const entry of kitEntries) {
    let kit: RdyKit;
    try {
      kit = await loadKit(entry.source);
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
