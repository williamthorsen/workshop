import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { buildKitFilename } from './buildKitFilename.ts';
import { type LoadedRdyKit, loadRdyKit } from './config.ts';
import { configError, kitLoadError, type RdyError, toRdyError, usageError } from './errors.ts';
import { EXIT_OK, EXIT_PROBLEMS_FOUND, EXIT_TOOL_FAILURE } from './exitCodes.ts';
import { formatCombinedSummary } from './formatCombinedSummary.ts';
import { formatJsonReport, type KitInput } from './formatJsonReport.ts';
import { describeUnresolvableImports } from './kitImports/describeUnresolvableImports.ts';
import { UnresolvableKitImportsError } from './kitImports/UnresolvableKitImportsError.ts';
import type { KitProvenance } from './KitProvenance.ts';
import { KITS_DIR, resolveHomeDir } from './kitsDir.ts';
import { getLayout } from './layout/engine.ts';
import { type BreadcrumbSegment, SEGMENT_SEPARATOR } from './layout/layoutEngine.ts';
import { DEFAULT_MANIFEST_PATH } from './manifest/manifestPath.ts';
import type { RdyManifest } from './manifest/manifestSchema.ts';
import { readManifest } from './manifest/readManifest.ts';
import { expandConfiguredPackages, type PackageKit } from './packages/expandConfiguredPackages.ts';
import { type FromSource, type NpmSource, parseFromValue } from './parseFromValue.ts';
import { type KitSpecifier, parseKitSpecifiers } from './parseKitSpecifiers.ts';
import { loadRemoteKit, type LoadRemoteKitOptions } from './remote/loadRemoteKit.ts';
import { resolveRemoteAuthHeaders, resolveRemoteProvider } from './remote/remote-provider.ts';
import { toRemoteRdyError } from './remote/toRemoteRdyError.ts';
import { countResults, reportRdy } from './reportRdy.ts';
import { readPackageVersion, resolvePackageRoot } from './resolvePackageRoot.ts';
import { resolveRequestedNames } from './resolveRequestedNames.ts';
import { runRdy } from './runRdy.ts';
import type { JsonDetail, JsonKitOrigin, JsonWarning, RaisedWarning } from './schemas/index.ts';
import type {
  ChecklistSummary,
  FixLocation,
  RdyChecklist,
  RdyKit,
  RdyReport,
  RdyStagedChecklist,
  Severity,
} from './types.ts';
import { extractHint, extractMessage } from './utils/error-handling.ts';
import { translateParseArgsError } from './utils/parse-args-error.ts';
import { checkDrift } from './verify/checkDrift.ts';
import { checkSourceDrift } from './verify/checkSourceDrift.ts';

/** The kit every source runs when the invocation names none. */
const DEFAULT_KIT_NAME = 'default';

/** Valid severity values for CLI flag validation. */
const VALID_SEVERITIES = new Set<string>(['error', 'warn', 'recommend']);

/** Discriminated union describing how to locate the rdy kit. */
export type KitSource = { path: string } | { url: string };

/** A resolved kit entry with its source and checklist filter. */
export interface ResolvedKitEntry {
  name: string;
  source: KitSource;
  checklists: string[];
  provenance?: KitProvenance;
}

export interface ParsedRunArgs {
  checklists: string[] | undefined;
  detail?: JsonDetail;
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

/**
 * Options accepted by the `run` subcommand.
 *
 * A letter earns a short flag only when it carries no dominant conflicting meaning in comparable
 * tools and means one thing across every `rdy` subcommand. The second clause is why `-f` is
 * `--file` here and nothing anywhere else. Pairs differing only by case are barred outright: a
 * shift-key slip must not be able to change what runs.
 */
const runOptions = {
  checklists: { type: 'string', short: 'c' },
  detail: { type: 'string' },
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

/** Validate and narrow a string to a Severity value. */
function parseSeverityFlag(flagName: string, value: string): Severity {
  if (!VALID_SEVERITIES.has(value)) {
    throw usageError(`${flagName} must be one of: error, warn, recommend (got "${value}")`);
  }
  if (value === 'error') return 'error';
  if (value === 'warn') return 'warn';
  return 'recommend';
}

/** Validate and narrow a string to a detail projection. */
function parseDetailFlag(value: string): JsonDetail {
  if (value === 'full' || value === 'summary') return value;
  throw usageError(`--detail must be one of: summary, full (got "${value}")`);
}

/** Build the GitHub raw content URL for a kit. */
function buildGitHubKitUrl(org: string, repo: string, ref: string, kit: string, extension: string): string {
  return `https://raw.githubusercontent.com/${org}/${repo}/${ref}/${KITS_DIR}/${kit}${extension}`;
}

/** Build the Bitbucket Cloud API source URL for a kit. */
function buildBitbucketKitUrl(workspace: string, repo: string, ref: string, kit: string, extension: string): string {
  return `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${ref}/${KITS_DIR}/${kit}${extension}`;
}

/** Guidance shown for every spelling of `--checklists` that names no checklist. */
const CHECKLISTS_HINT = '--checklists requires a comma-separated list of checklist names';

/** Map generic "requires a value" errors to domain-specific hints for run-subcommand flags. */
const flagErrorHints: Record<string, string> = {
  '--checklists': CHECKLISTS_HINT,
  '--detail': '--detail requires a projection (summary, full)',
  '--fail-on': '--fail-on requires a severity level (error, warn, recommend)',
  '--file': '--file requires a path argument',
  '--from': '--from requires a source argument (path, github:org/repo, npm:package, global, dir:path)',
  '--report-on': '--report-on requires a severity level (error, warn, recommend)',
  '--url': '--url requires a URL argument',
};

/** The subset of parsed run flags whose combinations are constrained. */
interface RunFlagConstraints {
  checklists: string | undefined;
  detail: string | undefined;
  file: string | undefined;
  from: string | undefined;
  internal: boolean;
  jit: boolean;
  json: boolean;
  packages: boolean;
  quiet: boolean;
  url: string | undefined;
}

/** Enforces output, exclusivity, mode-flag, and selection constraints, returning the active source flag. */
function validateFlagConstraints(parsed: RunFlagConstraints, kitSpecifiers: KitSpecifier[]): string | undefined {
  validateOutputFlags(parsed);

  const sourceFlags = collectSourceFlags(parsed);

  if (sourceFlags.length > 1) {
    throw usageError(`Cannot combine ${sourceFlags.join(', ')} flags`);
  }

  // `--packages` runs every kit its configured packages publish, so nothing it could be paired with
  // narrows that set: a positional or a `--checklists` filter names kits in this project instead.
  if (parsed.packages && kitSpecifiers.length > 0) {
    throw usageError('--packages cannot be combined with positional kit arguments');
  }
  if (parsed.packages && parsed.checklists !== undefined) {
    throw usageError('--packages cannot be combined with --checklists; it runs every kit each package publishes');
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
 * Rejects an output flag that contradicts the report being emitted.
 *
 * Erroring beats ignoring: a caller that passed either flag meant to change the output, and dropping it
 * silently would leave them reading a report they did not ask for.
 */
function validateOutputFlags(parsed: RunFlagConstraints): void {
  // `--detail` selects how much of the JSON payload to emit, so it has nothing to say about the human report.
  if (parsed.detail !== undefined && !parsed.json) {
    throw usageError('--detail requires --json; it selects how much of the JSON report to emit');
  }

  // `--quiet` thins the human detail tree, which `--json` does not emit.
  if (parsed.quiet && parsed.json) {
    throw usageError('--quiet cannot be combined with --json; it hides passed lines from human output only');
  }
}

/** Names the source flags this invocation carries, alphabetically, as the exclusivity error lists them. */
function collectSourceFlags(parsed: RunFlagConstraints): string[] {
  const sourceFlags: string[] = [];
  if (parsed.file !== undefined) sourceFlags.push('--file');
  if (parsed.from !== undefined) sourceFlags.push('--from');
  if (parsed.packages) sourceFlags.push('--packages');
  if (parsed.url !== undefined) sourceFlags.push('--url');
  return sourceFlags;
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
    throw usageError(translateParseArgsError(error, 'run', flagErrorHints), { cause: error });
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
    detail: values.detail,
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
  // is constrained by how many kits were named and whether the one named carries its own filter.
  let kitSpecifiers: KitSpecifier[];
  try {
    kitSpecifiers = parseKitSpecifiers(positionals);
  } catch (error: unknown) {
    throw usageError(extractMessage(error), { cause: error });
  }

  validateFlagConstraints(parsed, kitSpecifiers);

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
  packages,
  configuredPackages,
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
  packages?: boolean;
  configuredPackages?: string[] | undefined;
}): ResolvedKitEntry[] {
  if (filePath !== undefined) {
    return [
      {
        name: path.basename(filePath, path.extname(filePath)),
        source: { path: filePath },
        checklists: checklists ?? [],
        provenance: { kind: 'directory', label: path.dirname(filePath) },
      },
    ];
  }
  if (urlValue !== undefined) {
    const { label, name } = describeUrlSource(urlValue);
    return [{ name, source: { url: urlValue }, checklists: checklists ?? [], provenance: { kind: 'remote', label } }];
  }

  // Assume `jit` is always false when `fromValue` is present; `parseRunArgs` enforces this constraint.
  const extension = jit ? '.ts' : '.js';

  // Fill the default before the `--packages` branch reads it, so a bare invocation is structurally
  // `--packages default` and the two forms cannot select different kits.
  const declaredSpecs = kitSpecifiers.length > 0 ? kitSpecifiers : [{ kitName: DEFAULT_KIT_NAME, checklists: [] }];

  if (packages === true) {
    const requestedNames = declaredSpecs.map((spec) => spec.kitName);
    return resolveConfiguredPackages(configuredPackages ?? [], requestedNames, extension);
  }

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
    case 'github': {
      const provenance: KitProvenance = { kind: 'remote', label: `github:${source.org}/${source.repo}@${source.ref}` };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { url: buildGitHubKitUrl(source.org, source.repo, source.ref, spec.kitName, extension) },
        checklists: spec.checklists,
        provenance,
      }));
    }

    case 'bitbucket': {
      const label = `bitbucket:${source.workspace}/${source.repo}@${source.ref}`;
      const provenance: KitProvenance = { kind: 'remote', label };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { url: buildBitbucketKitUrl(source.workspace, source.repo, source.ref, spec.kitName, extension) },
        checklists: spec.checklists,
        provenance,
      }));
    }

    case 'npm': {
      const root = resolveInstalledPackageRoot(source);
      const provenance: KitProvenance = {
        kind: 'package',
        packageName: source.name,
        version: readPackageVersion(root),
      };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(root, KITS_DIR, `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
        provenance,
      }));
    }

    case 'global': {
      const homeDir = resolveHomeDir();
      const provenance: KitProvenance = { kind: 'directory', label: `~/${KITS_DIR}` };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(homeDir, KITS_DIR, `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
        provenance,
      }));
    }

    case 'directory': {
      const provenance: KitProvenance = { kind: 'directory', label: source.path };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(path.resolve(process.cwd(), source.path), `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
        provenance,
      }));
    }

    case 'local': {
      const resolvedBase = path.resolve(process.cwd(), source.path);
      const provenance: KitProvenance = { kind: 'directory', label: path.join(source.path, KITS_DIR) };
      return specs.map((spec) => ({
        name: spec.kitName,
        source: { path: path.join(resolvedBase, KITS_DIR, `${spec.kitName}${extension}`) },
        checklists: spec.checklists,
        provenance,
      }));
    }
  }
}

/**
 * Resolves the requested kits, drawn from what the configured packages publish, into run entries.
 *
 * An empty list is a usage error rather than an empty run: `--packages` with nothing configured would
 * otherwise report a clean pass having checked nothing, which is the one outcome a verification tool
 * must never invent.
 */
function resolveConfiguredPackages(
  configuredPackages: string[],
  requestedNames: string[],
  extension: string,
): ResolvedKitEntry[] {
  if (configuredPackages.length === 0) {
    throw usageError('--packages requires a "packages" list in the readyup config; none is configured.');
  }

  const published = expandConfiguredPackages(configuredPackages, extension);

  return selectRequestedKits(published, requestedNames).map((kit) => ({
    name: kit.kitName,
    source: { path: kit.path },
    checklists: [],
    provenance: { kind: 'package', packageName: kit.packageName, version: kit.version },
  }));
}

/**
 * Narrows what the configured packages publish to the requested kits, name-major.
 *
 * Name-major so `--packages a b` runs every package's `a` before any package's `b`, matching the
 * order `rdy run a b` runs them in against a single source.
 */
function selectRequestedKits(published: PackageKit[], requestedNames: string[]): PackageKit[] {
  return requestedNames.flatMap((kitName) =>
    kitName === DEFAULT_KIT_NAME ? selectDefaultKits(published) : selectNamedKits(published, kitName),
  );
}

/**
 * Selects `default` from every configured package, failing on one that publishes none.
 *
 * A package missing `default` is drift between a hand-maintained list and a convention readyup's own
 * `publishing` kit enforces, so it fails the run the way an absent package already does. The kits it
 * does publish are named because the reader's next move is to run one of them by name.
 */
function selectDefaultKits(published: PackageKit[]): PackageKit[] {
  const packageNames = new Set(published.map((kit) => kit.packageName));

  return [...packageNames].map((packageName) => {
    const kits = published.filter((kit) => kit.packageName === packageName);
    const defaultKit = kits.find((kit) => kit.kitName === DEFAULT_KIT_NAME);
    if (defaultKit === undefined) {
      const names = kits.map((kit) => kit.kitName).join(', ');
      throw configError(
        `Configured package "${packageName}" publishes no kit named "${DEFAULT_KIT_NAME}"; it publishes: ${names}.`,
      );
    }
    return defaultKit;
  });
}

/**
 * Selects a named kit from every configured package publishing it, rejecting a name none publishes.
 *
 * A package without the kit is skipped rather than reported: naming a kit is a selection across the
 * configured set, and a package that does not participate is not drift. A name nothing publishes is a
 * bad invocation, and answering it with an empty pass would be the clean report of nothing checked.
 */
function selectNamedKits(published: PackageKit[], kitName: string): PackageKit[] {
  const selected = published.filter((kit) => kit.kitName === kitName);
  if (selected.length === 0) {
    const available = [...new Set(published.map((kit) => kit.kitName))].join(', ');
    throw usageError(`No configured package publishes a kit named "${kitName}"; available kits: ${available}.`);
  }
  return selected;
}

/**
 * Locates the root of a package named by `npm:`, rejecting the forms that are reserved but not yet served.
 *
 * A version spec is parsed rather than ignored so the syntax stays reserved for running a published
 * version; until that lands, naming one is answered with the flag that reaches a published kit today.
 *
 * The not-installed message names the direct-dependency requirement because pnpm's layout links only
 * direct dependencies into a project's `node_modules`. A transitive dependency is genuinely unreachable
 * here, and a bare "not installed" would contradict the lockfile the reader is looking at.
 */
function resolveInstalledPackageRoot(source: NpmSource): string {
  if (source.versionSpec !== undefined) {
    throw usageError(
      `Running a published version is not supported yet: "npm:${source.name}@${source.versionSpec}". ` +
        'Use --url to name a published kit, or drop the version to run the installed copy.',
    );
  }

  const root = resolvePackageRoot(source.name);
  if (root === undefined) {
    throw kitLoadError(`Package "${source.name}" is not installed; it must be a direct dependency of this project.`);
  }
  return root;
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
  detail?: JsonDetail;
  failOn?: Severity;
  quiet?: boolean;
  reportOn?: Severity;
}

interface HumanRunSettings {
  failOn: Severity | undefined;
  quiet: boolean;
  reportOn: Severity | undefined;
}

/**
 * Loads a rdy kit from a path or URL source.
 *
 * Takes the whole entry rather than its source alone: a kit whose readyup imports the runner cannot satisfy is
 * reported with a remedy chosen from the kit's provenance, which the source by itself does not carry.
 */
async function loadKit(entry: ResolvedKitEntry, isJit: boolean): Promise<LoadedRdyKit> {
  const { source } = entry;

  if ('url' in source) {
    const provider = resolveRemoteProvider(source.url);
    const headers = resolveRemoteAuthHeaders(provider);
    const options: LoadRemoteKitOptions = { url: source.url, ...(headers !== undefined && { headers }) };

    try {
      return await loadRemoteKit(options);
    } catch (error: unknown) {
      // Catch ahead of the remote wrapper: a kit that fetched cleanly and binds symbols the runner lacks is a
      // diagnosis about the kit, and reshaping it as a fetch failure would name the wrong thing.
      if (error instanceof UnresolvableKitImportsError) throw toUnresolvableImportsError(error, entry);
      throw toRemoteRdyError(error, {
        code: 'kit-load',
        provider,
        tokenForwarded: headers !== undefined,
        url: source.url,
      });
    }
  }

  try {
    return await loadRdyKit(source.path);
  } catch (error: unknown) {
    if (error instanceof UnresolvableKitImportsError) throw toUnresolvableImportsError(error, entry);
    if (isJit && isModuleNotFoundError(error, 'readyup')) {
      throw kitLoadError('Running from source requires readyup to be installed as a project dependency.', {
        cause: error,
      });
    }
    throw kitLoadError(extractMessage(error), { cause: error, hint: extractHint(error) });
  }
}

/** Turns unresolvable readyup imports into the kit-load failure a reader sees, named for where the kit came from. */
function toUnresolvableImportsError(error: UnresolvableKitImportsError, entry: ResolvedKitEntry): RdyError {
  const { hint, message } = describeUnresolvableImports(error.findings, {
    kitName: entry.name,
    provenance: entry.provenance,
  });
  return kitLoadError(message, { cause: error, hint });
}

/** The manifest an invocation checks its kits against, read once and shared by every kit in the run. */
interface ManifestTracking {
  manifest: RdyManifest;
  manifestDir: string;
}

/**
 * Read the default manifest for the run's advisories, best effort.
 *
 * Every failure here answers with no manifest at all: a missing one is the normal state of a
 * project that never compiled, and an unreadable or unrecognized one says nothing about any kit. A
 * verification tool that refused to run because its own bookkeeping was unreadable would be worse
 * than one that runs and stays quiet. `--jit` runs from source, which the manifest does not
 * describe, so they skip the read entirely.
 */
function readManifestTracking(isJit: boolean): ManifestTracking | undefined {
  if (isJit) return undefined;
  const manifestPath = path.resolve(process.cwd(), DEFAULT_MANIFEST_PATH);
  try {
    return { manifest: readManifest(manifestPath), manifestDir: path.dirname(manifestPath) };
  } catch {
    return undefined;
  }
}

/**
 * Emit advisory stderr warnings when the manifest disagrees with the kit that is about to run.
 *
 * `target-drift` says the compiled bundle is not the one the manifest recorded, so someone edited
 * it by hand. `source-stale` says the TypeScript it was built from has moved on, so the run is
 * about to execute checks that no longer match their source. Both can hold at once.
 *
 * Advisory by design: `rdy verify` is the enforcing gate, and this never touches the exit code. A
 * kit no entry describes, an entry recording no hash, a remote or just-in-time source, and a file
 * that cannot be hashed are all silent, because none of them is evidence that anything is stale.
 *
 * The stderr lines are written in both modes; the returned entries are what JSON mode captures into
 * the report, so a consumer that owns only stdout still learns the run was advised of something.
 */
function warnOnKitStaleness(
  kitName: string,
  source: KitSource,
  tracking: ManifestTracking | undefined,
): RaisedWarning[] {
  if (tracking === undefined || 'url' in source) return [];

  const entry = findManifestEntry(source.path, tracking);
  if (entry === undefined) return [];

  const warnings: RaisedWarning[] = [];
  if (hasVerdict(() => checkDrift(entry, tracking.manifestDir), 'drift')) {
    warnings.push({
      code: 'target-drift',
      message: `compiled kit "${kitName}" does not match the hash the manifest recorded for it.`,
      remedy: 'Run `rdy compile --force` to rebuild it from source.',
    });
  }
  if (hasVerdict(() => checkSourceDrift(entry, tracking.manifestDir), 'stale')) {
    warnings.push({
      code: 'source-stale',
      message: `kit "${kitName}" was compiled from an older source than the one on disk.`,
      remedy: 'Run `rdy compile` to rebuild it.',
    });
  }

  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning.message} ${warning.remedy}\n`);
  }
  return warnings;
}

/**
 * Find the manifest entry describing a kit, matching on resolved compiled path.
 *
 * Matching by name instead would misfire wherever a kit's name and its file part company: `--file`
 * names a kit by an arbitrary path, and a custom `outDir` puts a differently-named entry's output
 * where this one's would go.
 */
function findManifestEntry(kitPath: string, tracking: ManifestTracking): RdyManifest['kits'][number] | undefined {
  const resolvedKitPath = path.resolve(process.cwd(), kitPath);
  return tracking.manifest.kits.find(
    (kit) => kit.path !== undefined && path.resolve(tracking.manifestDir, kit.path) === resolvedKitPath,
  );
}

/** Report whether a staleness predicate reaches the given verdict, treating a file it cannot hash as no. */
function hasVerdict<TStatus extends { kind: string }>(check: () => TStatus, kind: TStatus['kind']): boolean {
  try {
    return check().kind === kind;
  } catch {
    return false;
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
  { kitEntries, json, detail, failOn, quiet, reportOn }: RunCommandOptions,
  isJit = false,
): Promise<number> {
  if (json) {
    return runMultiKitJsonMode(kitEntries, { detail: detail ?? 'full', failOn, reportOn }, isJit);
  }
  return runMultiKitHumanMode(kitEntries, { failOn, quiet: quiet === true, reportOn }, isJit);
}

/**
 * Runs all kit entries in JSON mode, producing a single JSON report.
 *
 * Each iteration is its own error boundary: once the run has dispatched, anything the loop body
 * throws is attributable to that kit alone, so it becomes an entry in the report rather than
 * discarding the kits that already ran. The scope is positional rather than keyed on `RdyErrorCode`
 * — a consumer cannot predict which codes would escape, and a new code would silently pick a branch.
 */
async function runMultiKitJsonMode(
  kitEntries: ResolvedKitEntry[],
  runSettings: { detail: JsonDetail; failOn: Severity | undefined; reportOn: Severity | undefined },
  isJit: boolean,
): Promise<number> {
  const { detail, failOn, reportOn } = runSettings;
  const kitInputs: KitInput[] = [];
  const warnings: JsonWarning[] = [];
  const tracking = readManifestTracking(isJit);
  let allPassed = true;
  let anyKitFailed = false;

  for (const entry of kitEntries) {
    try {
      const { kit, compileTimeVersion } = await loadKit(entry, isJit);

      warnings.push(...warnOnKitStaleness(entry.name, entry.source, tracking));

      const thresholds = resolveThresholds(kit, failOn, reportOn);
      const checklists = selectChecklists(kit, entry.checklists);

      const entries: Array<{ name: string; report: RdyReport }> = [];

      for (const checklist of checklists) {
        const report = await runRdy(checklist, {
          defaultSeverity: thresholds.defaultSeverity,
          failOn: thresholds.failOn,
        });
        entries.push({ name: checklist.name, report });
        if (!report.passed) allPassed = false;
      }

      kitInputs.push({
        name: entry.name,
        ...toJsonOriginField(entry.provenance),
        ...(compileTimeVersion !== undefined && { compiledWith: compileTimeVersion }),
        entries,
        failOn: thresholds.failOn,
        reportOn: thresholds.reportOn,
      });
    } catch (error: unknown) {
      // An entry built here carries no `compiledWith`: a kit that produced no results has nothing
      // for a compile-time version to explain.
      const { code, hint, message } = toRdyError(error);
      kitInputs.push({
        name: entry.name,
        ...toJsonOriginField(entry.provenance),
        error: { code, message, ...(hint !== undefined && { hint }) },
      });
      anyKitFailed = true;
    }
  }

  // The top-level thresholds say what the invocation asked for, so an absent flag stays absent
  // rather than being reported as a default nobody requested. What governed each kit, including a
  // threshold the kit declared for itself, travels on that kit's entry.
  const output = formatJsonReport(kitInputs, {
    detail,
    ...(failOn !== undefined && { failOn }),
    ...(reportOn !== undefined && { reportOn }),
    ...(warnings.length > 0 && { warnings }),
  });
  process.stdout.write(output + '\n');

  return resolveRunExitCode(anyKitFailed, allPassed);
}

/**
 * Runs all kit entries in human-readable mode.
 *
 * Carries the same per-kit boundary as JSON mode, reporting the failure on stderr so it stays
 * distinguishable from a failed check, which prints into the stdout report and means a different
 * exit code.
 */
async function runMultiKitHumanMode(
  kitEntries: ResolvedKitEntry[],
  settings: HumanRunSettings,
  isJit: boolean,
): Promise<number> {
  const isMultiKit = kitEntries.length > 1;
  const tracking = readManifestTracking(isJit);
  const writeBlock = createBlockWriter();
  let allPassed = true;
  let anyKitFailed = false;

  for (const entry of kitEntries) {
    const kitSegments = buildKitSegments(entry, isMultiKit);

    try {
      const { kit } = await loadKit(entry, isJit);

      warnOnKitStaleness(entry.name, entry.source, tracking);

      const exitCode = await runSingleKitHumanMode(kit, entry.checklists, settings, {
        isMultiKit,
        kitSegments,
        writeBlock,
      });
      if (exitCode !== EXIT_OK) allPassed = false;
    } catch (error: unknown) {
      // A kit that never ran is still headed, so stdout lists every kit the invocation asked for.
      if (kitSegments.length > 0) writeBlock(getLayout().formatBreadcrumb(kitSegments, 'kit'), true);

      // A lone kit needs no label: nothing to disambiguate, and its source is already in the message.
      const label = kitSegments.length > 0 ? ` [${toBreadcrumbLabel(kitSegments)}]` : '';
      const rdyError = toRdyError(error);
      process.stderr.write(`Error${label}: ${rdyError.message}\n`);
      if (rdyError.hint !== undefined) {
        process.stderr.write(getLayout().formatHint(rdyError.hint) + '\n');
      }
      anyKitFailed = true;
    }
  }

  return resolveRunExitCode(anyKitFailed, allPassed);
}

/** What a kit's checklists need in order to take their place in the run's sequence of blocks. */
interface KitBlockContext {
  isMultiKit: boolean;
  kitSegments: BreadcrumbSegment[];
  writeBlock: BlockWriter;
}

/** Run checklists from a single kit in human-readable mode. */
async function runSingleKitHumanMode(
  kit: RdyKit,
  checklistFilter: string[],
  settings: HumanRunSettings,
  { isMultiKit, kitSegments, writeBlock }: KitBlockContext,
): Promise<number> {
  const checklists = selectChecklists(kit, checklistFilter);
  const thresholds = resolveThresholds(kit, settings.failOn, settings.reportOn);
  const showChecklistSegment = checklists.length > 1;
  let allPassed = true;
  let startsKit = true;
  const summaries: ChecklistSummary[] = [];

  for (const checklist of checklists) {
    const report = await runRdy(checklist, {
      defaultSeverity: thresholds.defaultSeverity,
      failOn: thresholds.failOn,
    });
    const fixLocation = resolveFixLocation(checklist, kit.fixLocation);
    const body = reportRdy(report, { fixLocation, quiet: settings.quiet, reportOn: thresholds.reportOn });

    const segments: BreadcrumbSegment[] = showChecklistSegment
      ? [...kitSegments, { role: 'checklist', text: checklist.name }]
      : kitSegments;
    const heading = segments.length > 0 ? `${getLayout().formatBreadcrumb(segments, 'kit')}\n` : '';

    writeBlock(heading + body, startsKit);
    startsKit = false;

    if (!report.passed) {
      allPassed = false;
    }

    if (showChecklistSegment) {
      summaries.push(summarizeReport(checklist.name, report));
    }
  }

  if (summaries.length > 1 && !isMultiKit) {
    writeBlock(formatCombinedSummary(summaries), false);
  }

  return allPassed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/**
 * Returns the `origin` field for a kit's JSON entry, empty for a kit no package published.
 *
 * The wire shape names the publishing package and nothing else, so every other provenance contributes no
 * field at all -- which is the shape a consumer has always seen for a kit resolved from anywhere but a
 * package. A version the package did not declare readably is omitted.
 */
function toJsonOriginField(provenance: KitProvenance | undefined): { origin?: JsonKitOrigin } {
  if (provenance?.kind !== 'package') return {};

  return {
    origin:
      provenance.version === undefined
        ? { package: provenance.packageName }
        : { package: provenance.packageName, version: provenance.version },
  };
}

/** Writes one block of a run to stdout, `startsKit` widening the gap that parts it from the block before. */
type BlockWriter = (text: string, startsKit: boolean) => void;

/**
 * Returns a writer that parts each block of a run from the one before, opening a wider gap at a kit boundary.
 *
 * Separation lives here rather than in the headings because only a sequence can see what precedes it: the
 * run's first block needs no blank at all, and once headings stopped nesting, a gap wider than the ones
 * within a kit is the reader's only remaining cue that the kit has changed.
 */
function createBlockWriter(): BlockWriter {
  let hasWritten = false;

  return (text, startsKit) => {
    if (hasWritten) process.stdout.write(startsKit ? '\n\n' : '\n');
    hasWritten = true;
    process.stdout.write(`${text}\n`);
  };
}

/**
 * Returns the segments heading every block a kit produces: where the kit came from, then the kit itself.
 *
 * A kit with no source to name and no sibling kit in the run has nothing to be told apart from, so it
 * heads its blocks with nothing, and a plain local run stays as quiet as it has always been.
 */
function buildKitSegments(entry: ResolvedKitEntry, isMultiKit: boolean): BreadcrumbSegment[] {
  const source = describeKitProvenance(entry.provenance);
  if (source === undefined) return isMultiKit ? [{ role: 'kit', text: entry.name }] : [];

  return [source, { role: 'kit', text: entry.name }];
}

/**
 * Returns the segment naming where a kit came from, or nothing where there is nothing to name.
 *
 * A kit the local kits directory holds has no source, and neither does one whose directory resolves to
 * the working directory: naming the directory the reader is standing in tells them nothing. A package
 * carries its version because the whole point of running a kit from an installed package is that it
 * matches the version in place, which the reader can only confirm if it is stated.
 */
function describeKitProvenance(provenance: KitProvenance | undefined): BreadcrumbSegment | undefined {
  if (provenance === undefined) return undefined;
  if (provenance.kind === 'remote') return { role: 'sourceRemote', text: provenance.label };
  if (provenance.kind === 'directory') {
    return path.normalize(provenance.label) === '.' ? undefined : { role: 'sourceDirectory', text: provenance.label };
  }

  const version = provenance.version === undefined ? '' : `@${provenance.version}`;
  return { role: 'sourcePackage', text: `${provenance.packageName}${version}` };
}

/** Returns a breadcrumb as plain text, for a stderr line that carries no layout of its own. */
function toBreadcrumbLabel(segments: BreadcrumbSegment[]): string {
  return segments.map((segment) => segment.text).join(SEGMENT_SEPARATOR);
}

/**
 * Splits a kit URL into the kit's name and the label naming where it was fetched from.
 *
 * The scheme is dropped from the label because every kit URL carries one and it distinguishes nothing.
 * A URL that does not parse is reported exactly as given, since a value the runner could not read is one
 * the reader needs to see unaltered.
 */
function describeUrlSource(urlValue: string): { label: string; name: string } {
  if (!URL.canParse(urlValue)) return { label: urlValue, name: urlValue };

  const { host, pathname } = new URL(urlValue);
  return { label: `${host}${pathname}`, name: path.basename(pathname, path.extname(pathname)) };
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

/**
 * Reduces a run's outcomes to one exit code, worst first.
 *
 * A kit that never ran outranks failed checks: part of the invocation was not completed, so
 * reporting "ran, found problems" would be false.
 */
function resolveRunExitCode(anyKitFailed: boolean, allPassed: boolean): number {
  if (anyKitFailed) return EXIT_TOOL_FAILURE;
  return allPassed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}
