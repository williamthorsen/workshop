import path from 'node:path';
import process from 'node:process';

import { loadRdyKit } from './config.ts';
import { formatCombinedSummary } from './formatCombinedSummary.ts';
import { formatJsonError } from './formatJsonError.ts';
import { formatJsonReport } from './formatJsonReport.ts';
import { loadRemoteKit, type LoadRemoteKitOptions } from './loadRemoteKit.ts';
import { parseArgs } from './parseArgs.ts';
import { reportRdy } from './reportRdy.ts';
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
} from './types.ts';

/** Valid severity values for CLI flag validation. */
const VALID_SEVERITIES = new Set<string>(['error', 'warn', 'recommend']);

/** Discriminated union describing how to locate the rdy kit. */
export type KitSource = { path: string } | { url: string };

interface ParsedRunArgs {
  kitName: string | undefined;
  failOn?: Severity;
  filePath: string | undefined;
  githubValue: string | undefined;
  json: boolean;
  localValue: string | undefined;
  names: string[];
  reportOn?: Severity;
  urlValue: string | undefined;
}

const runFlagSchema = {
  file: { long: '--file', type: 'string' as const, short: '-f' },
  github: { long: '--github', type: 'string' as const, short: '-g' },
  url: { long: '--url', type: 'string' as const, short: '-u' },
  kit: { long: '--kit', type: 'string' as const, short: '-k' },
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
  '--kit': '--kit requires a kit name',
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

  // Validate severity flags.
  const failOn = parsed.failOn !== undefined ? parseSeverityFlag('--fail-on', parsed.failOn) : undefined;
  const reportOn = parsed.reportOn !== undefined ? parseSeverityFlag('--report-on', parsed.reportOn) : undefined;

  const parsedArgs: ParsedRunArgs = {
    kitName: parsed.kit,
    filePath: parsed.file,
    githubValue: parsed.github,
    json: parsed.json,
    localValue: parsed.local,
    names: positionals,
    urlValue: parsed.url,
  };
  if (failOn !== undefined) parsedArgs.failOn = failOn;
  if (reportOn !== undefined) parsedArgs.reportOn = reportOn;
  return parsedArgs;
}

/** Validate flag co-dependencies and build the KitSource from parsed flag state. */
export function resolveKitSource({
  filePath,
  githubValue,
  localValue,
  urlValue,
  kitName,
  internalDir,
  internalExtension,
}: {
  filePath: string | undefined;
  githubValue: string | undefined;
  localValue: string | undefined;
  urlValue: string | undefined;
  kitName: string | undefined;
  internalDir: string;
  internalExtension: string;
}): KitSource {
  if (filePath !== undefined) {
    if (kitName !== undefined) {
      throw new Error('--kit cannot be used with --file');
    }
    return { path: filePath };
  }
  if (githubValue !== undefined) {
    const name = kitName ?? 'default';
    const { repo, ref } = parseGitHubArg(githubValue);
    return { url: buildGitHubKitUrl(repo, ref, name) };
  }
  if (localValue !== undefined) {
    const name = kitName ?? 'default';
    const resolvedBase = path.resolve(process.cwd(), localValue);
    return { path: path.join(resolvedBase, KITS_DIR, `${name}.js`) };
  }
  if (urlValue !== undefined) {
    if (kitName !== undefined) {
      throw new Error('--kit cannot be used with --url');
    }
    return { url: urlValue };
  }
  const name = kitName ?? 'default';
  return { path: path.join(KITS_DIR, internalDir, `${name}${internalExtension}`) };
}

/** Resolve the effective fixLocation for a checklist, falling back to the kit-level default. */
function resolveFixLocation(checklist: RdyChecklist | RdyStagedChecklist, kitDefault?: FixLocation): FixLocation {
  return checklist.fixLocation ?? kitDefault ?? 'end';
}

/** Build a checklist summary from a report, filtering results by reporting threshold. */
function summarizeReport(name: string, report: RdyReport, reportOn: Severity): ChecklistSummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of report.results) {
    if (!meetsThreshold(r.severity, reportOn)) continue;
    if (r.status === 'passed') passed++;
    else if (r.status === 'failed') failed++;
    else skipped++;
  }
  return { name, passed, failed, skipped, allPassed: report.passed, durationMs: report.durationMs };
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
  kitSource: KitSource;
  json: boolean;
  names: string[];
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

/** Run rdy checklists. Returns a numeric exit code. */
export async function runCommand({ names, kitSource, json, failOn, reportOn }: RunCommandOptions): Promise<number> {
  let kit: RdyKit;
  try {
    kit = await loadKit(kitSource);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      process.stdout.write(formatJsonError(message) + '\n');
    } else {
      process.stderr.write(`Error: ${message}\n`);
    }
    return 1;
  }

  return runSingleKit(kit, names, json, failOn, reportOn);
}

/** Run checklists from a single kit. */
async function runSingleKit(
  kit: RdyKit,
  names: string[],
  json: boolean,
  failOn: Severity | undefined,
  reportOn: Severity | undefined,
): Promise<number> {
  // Resolve requested names (expanding suite names) and filter checklists
  let resolvedNames: string[];
  try {
    resolvedNames = resolveRequestedNames(names, kit);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      process.stdout.write(formatJsonError(message) + '\n');
    } else {
      process.stderr.write(`Error: ${message}\n`);
    }
    return 1;
  }

  // All names in `resolvedNames` are guaranteed valid by `resolveRequestedNames`; the
  // flatMap guard serves only as a type-narrowing filter for the `Map.get` return type.
  const checklistByName = new Map(kit.checklists.map((c) => [c.name, c]));
  const checklists = resolvedNames.flatMap((name) => {
    const checklist = checklistByName.get(name);
    return checklist !== undefined ? [checklist] : [];
  });

  const thresholds = resolveThresholds(kit, failOn, reportOn);

  if (json) {
    return runJsonMode(checklists, thresholds);
  }

  return runHumanMode(checklists, kit, thresholds);
}

/** Run checklists and emit a single JSON object to stdout. */
async function runJsonMode(
  checklists: Array<RdyChecklist | RdyStagedChecklist>,
  thresholds: { defaultSeverity: Severity; failOn: Severity; reportOn: Severity },
): Promise<number> {
  const entries: Array<{ name: string; report: RdyReport }> = [];
  let allPassed = true;

  try {
    for (const checklist of checklists) {
      const report = await runRdy(checklist, {
        defaultSeverity: thresholds.defaultSeverity,
        failOn: thresholds.failOn,
      });
      entries.push({ name: checklist.name, report });
      if (!report.passed) allPassed = false;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(formatJsonError(message) + '\n');
    return 1;
  }

  process.stdout.write(formatJsonReport(entries, { reportOn: thresholds.reportOn }) + '\n');
  return allPassed ? 0 : 1;
}

/** Run checklists with human-readable output. */
async function runHumanMode(
  checklists: Array<RdyChecklist | RdyStagedChecklist>,
  kit: RdyKit,
  thresholds: { defaultSeverity: Severity; failOn: Severity; reportOn: Severity },
): Promise<number> {
  const showHeader = checklists.length > 1;
  let allPassed = true;
  const summaries: ChecklistSummary[] = [];

  try {
    for (const checklist of checklists) {
      if (showHeader) {
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

      if (showHeader) {
        summaries.push(summarizeReport(checklist.name, report, thresholds.reportOn));
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  if (summaries.length > 1) {
    process.stdout.write('\n' + formatCombinedSummary(summaries) + '\n');
  }

  return allPassed ? 0 : 1;
}
