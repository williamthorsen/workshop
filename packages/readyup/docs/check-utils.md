# Check utilities

Reusable check functions for common assertions:

```ts
import { fileExists, hasPackageJsonField } from 'readyup/check-utils';
```

Every path a check utility takes resolves against `cwd` unless it is absolute, in which case it names the file itself; `filesExist` applies that rule to `baseDir` too, and an absolute entry in its list outranks the base directory.

## Outcomes

| Function                                  | Returns                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| `missingFrom(category, expected, actual)` | `CheckOutcome` with fraction progress over any collection |

`missingFrom` is what `filesExist` and `hasJsonFields` are built from. Reach for it directly to count anything else: it passes when nothing is missing, and otherwise names what was, under a fraction of how many were found.

## Filesystem

| Function                            | Returns                             |
| ----------------------------------- | ----------------------------------- |
| `fileExists(path)`                  | File exists                         |
| `filesExist(paths, options?)`       | `CheckOutcome` over several paths   |
| `readFile(path)`                    | Contents, or `undefined` if missing |
| `fileContains(path, pattern)`       | File matches a `RegExp`             |
| `fileDoesNotContain(path, pattern)` | File does not match a `RegExp`      |
| `commandExists(name)`               | Command is on `PATH`                |

## JSON

| Function                               | Returns                                   |
| -------------------------------------- | ----------------------------------------- |
| `readJsonFile(path)`                   | Parsed object, or `undefined`             |
| `readJsonValue(path, ...keys)`         | Value at a key path within a file         |
| `hasJsonField(path, field, value?)`    | Field exists, optionally matching a value |
| `hasJsonFields(path, fields)`          | `CheckOutcome` over several fields        |
| `projectJsonFile(path, paths)`         | Serialized projection of a JSON file      |
| `describeJsonProjectionFailure(error)` | Why a projection failed, without the path |
| `getJsonValue(obj, ...keys)`           | Value at a key path within an object      |
| `hasJsonValue(obj, ...keys)`           | Key path is present                       |
| `isRecord(value)`                      | Type guard for `Record<string, unknown>`  |

`projectJsonFile` returns what [`pickJson`](authoring-kits.md#inlining-json-at-compile-time) inlines: the paths it names projected out of the file, serialized. It is the one implementation of that projection, so a check reading an entry's [recorded inputs](publishing-kits.md#what-a-manifest-entry-records) decides an inlined JSON file the same way the compile that recorded it did. It throws when the file is unreadable, holds invalid JSON, holds something other than an object, or no longer holds a path the specifier names. `describeJsonProjectionFailure` words any of those four for a report, and words them without the file path, so a check that already names the file does not name it twice.

## Package manifests

| Function                                              | Returns                                   |
| ----------------------------------------------------- | ----------------------------------------- |
| `readPackageJson()`                                   | Parsed `package.json`                     |
| `hasPackageJsonField(field, value?)`                  | Field exists, optionally matching a value |
| `hasDevDependency(name)`                              | Dev dependency is declared                |
| `hasMinDevDependencyVersion(name, version, options?)` | Dev dependency meets a minimum            |

`hasMinDevDependencyVersion` compares the floor against the version it reads out of the specifier in `package.json`, so the specifier's protocol can settle the question before any comparison happens. Any `workspace:`-prefixed specifier satisfies any floor, `workspace:^1.2.3` included: it links to the package the repo builds, and a repo that publishes a package is not a consumer of it. A `catalog:` specifier settles nothing on its own and is resolved through `pnpm-workspace.yaml` in the working directory, and the version found there is what the floor is compared against. `catalog:` names the `default` catalog, which pnpm also spells `catalog:default`, and which the file writes as the top-level `catalog:` block or as a `default` block under `catalogs:`; any other `catalog:<name>` selects its own block under `catalogs:`. A specifier the file does not resolve meets no floor, as does one whose catalog entry opens a YAML construct this reader does not follow, such as an alias or a flow mapping. A version reached that way is read the same as a declared one, so a catalog entry of `workspace:*` satisfies any floor in its turn. The version is read from the start of the specifier, past any range operator, so one naming fewer than three segments (`7`, `^6`) is measured rather than skipped; a specifier with its version elsewhere, as the `npm:` alias protocol does, is read for a three-segment version anywhere in it. Pass `options.exempt` to exempt further specifiers; it receives the specifier as written, so a catalogued dependency reaches it as `catalog:` rather than as the version behind it, and it adds to the built-in exemption rather than replacing it.

## Versions and runtime alignment

| Function                             | Returns                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `compareVersions(a, b)`              | Comparison of two semver strings                                                         |
| `readEnginesNodeFloor(manifest)`     | `{ kind: 'found', floor, raw }`, `{ kind: 'absent' }`, or `{ kind: 'unparseable', raw }` |
| `satisfiesNodeFloor(version, floor)` | Whether a runtime meets a floor; `undefined` if either is uncomparable                   |
| `readToolVersionsNode(path?)`        | Node version declared in `.tool-versions`                                                |
| `esYearForNodeMajor(major)`          | ECMAScript year a Node major supports (`24` → `es2025`)                                  |
| `readTsconfigLanguageLevel(path)`    | Effective `lib` and `target`, resolved through `extends`                                 |
| `readTsconfigChain(path)`            | Each config the `extends` chain reaches, and what it declares in its own right           |

Each reader reports only what it can see, so a check composing them decides for itself what each unknown means. `readEnginesNodeFloor` recognizes only forms from which a single floor follows (`>=24`, `^22.1`, `24.1.0`); a union or wildcard comes back `unparseable` rather than an invented floor. `readTsconfigLanguageLevel` resolves `extends` as TypeScript does, following relative paths and published base configs alike; it also returns `chain` (the configs it read) and `unresolvedExtends` (references it could not follow), so a check can tell an incomplete read from an undeclared setting. `readTsconfigChain` reports that same walk one layer down: every config it reached, the `extends` specifier that reached each one, and what each declares in its own right, with values left exactly as written. Reach for it to ask which config declared a setting, or to read a field the language-level reader does not cover, such as `files` or `include`. The specifier is a chain entry's stable identity: a package's path shifts with install layout, resolving under `node_modules/.pnpm/` in one project and under a linked workspace directory in another. Where two `extends` branches reach one config, the entry names the branch that reached it first.

```ts
import {
  discoverWorkspaces,
  readEnginesNodeFloor,
  readToolVersionsNode,
  satisfiesNodeFloor,
} from 'readyup/check-utils';

const runtime = readToolVersionsNode();

const findings = discoverWorkspaces().flatMap(({ dir, packageJson }) => {
  const declared = readEnginesNodeFloor(packageJson);
  if (declared.kind === 'absent') return [`${dir}: declares no engines.node`];
  if (declared.kind === 'unparseable') return [`${dir}: engines.node "${declared.raw}" names no single floor`];

  const meetsFloor = runtime === undefined ? undefined : satisfiesNodeFloor(runtime, declared.floor);
  if (meetsFloor === undefined) return [`${dir}: floor ${declared.floor} has no comparable runtime`];
  return meetsFloor ? [] : [`${dir}: runtime ${runtime} is below its ${declared.floor} floor`];
});
```

## Git

| Function                                 | Returns                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `runGit(path, ...args)`                  | Trimmed stdout of a git command                   |
| `isGitRepo(path)`                        | Path is inside a git working tree                 |
| `isAtRepoRoot(path)`                     | Path is the top of a working tree                 |
| `expandHome(path)`                       | Leading `~` expanded to the home directory        |
| `compareLocalRefs(path, refA, refB)`     | Discriminated union comparing two local refs      |
| `compareRefToRemote(path, ref, remote?)` | Discriminated union comparing a ref to its remote |
| `makeLocalRefSyncCheck(options)`         | An `RdyCheck` verifying two local refs match      |
| `makeRemoteRefSyncCheck(options)`        | An `RdyCheck` verifying a ref matches its remote  |

## Hashing

| Function                                  | Returns                                        |
| ----------------------------------------- | ---------------------------------------------- |
| `computeHash(content)`                    | Hash of a string or byte sequence              |
| `fileMatchesHash(path, expected)`         | File's hash matches the expected               |
| `hashToRecordedLength(content, recorded)` | Hash truncated to a recorded hash's own length |
| `isRecordedHash(value)`                   | Value is a well-formed recorded hash           |

## Workspaces

`discoverWorkspaces()` returns a uniform `Workspace[]` collapsing pnpm, npm, and yarn monorepo conventions -- and single-workspace repos -- into one iteration shape. Each entry has `dir` (relative to `cwd`; `'.'` for the repo root), `absolutePath`, `name`, `isPackage` (`package.json.private !== true`), `isRoot`, and the parsed `packageJson`.

The repo root is reported in every shape, exactly once, so every call shape is a filter over one list rather than a list a caller adds the root to and dedupes.

```ts
const members = discoverWorkspaces({ filter: (w) => !w.isRoot });
const packages = discoverWorkspaces({ filter: (w) => w.isPackage });
```

`isRoot` is independent of `isPackage`: a monorepo may publish its root, and a member may be private. A root `package.json` that is missing or unparseable throws, whatever the repo's shape.

A kit test that needs a `Workspace` value builds one with `makeWorkspace`; see [Testing a kit](authoring-kits.md#testing-a-kit).

`pnpm-workspace.yaml` is read by a minimal block-sequence parser; configs using YAML anchors, flow sequences, or negation patterns raise a clear error.

Discovery is memoized per `cwd` for the life of the process: Repeated calls in one run share a single directory walk. `filter` is applied per call rather than being part of the key, so two checks filtering differently share that walk too. Entries are the same `Workspace` objects on every call, frozen along with their `packageJson`, so a write throws rather than reaching the next caller; a workspace added or removed after the first call does not appear in later results. A discovery that throws is not memoized.

## Kit packages

`discoverKitPackages(fromDir?)` names the installed dependencies that publish kits, sorted. It reads the `dependencies` and `devDependencies` a project declares rather than sweeping `node_modules`, so every name it returns is one the reader chose to depend on and can act on; a transitive package is not. `fromDir` defaults to `cwd`, which under `rdy run --from <other-repo>` is the project being checked rather than the repo the kit came from.

```ts
const missing = discoverKitPackages().filter((name) => !configuredPackages.includes(name));
```

It is best effort: a project manifest it cannot read or parse yields `[]`. An empty result therefore does not distinguish a project with no kit-publishing dependencies from one whose manifest could not be read, which a check treating the result as authoritative would report as a pass either way.

## Project sources

| Function                              | Returns                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| `listTrackedFiles()`                  | Paths git tracks under `cwd`                                   |
| `readTrackedSources(filter?)`         | `{ path, text }` for each tracked path the filter selects      |
| `blankNonCode(text)`                  | The same text with every comment and literal blanked           |
| `getLineAtOffset(text, offset)`       | The 1-based line holding an offset                             |
| `countPackageUsage(sources, options)` | Calls into a package, counted only where the source imports it |
| `buildFindingReport(options)`         | A `FindingOutcome` the runner suppresses, renders, and counts  |

These six are what an adoption kit needs -- one reporting where a project hand-rolls what a package it already installed provides. Both readers return `undefined` outside a git working tree, which an empty list does not say: a project that cannot be swept is a different result from one that was swept and holds nothing.

`listTrackedFiles` lists with `git ls-files -z`. The `-z` is what makes the list complete: without it git escapes a path holding a non-ASCII byte and wraps it in quotes, and that file drops out of the sweep unreported. Below the repo root git emits paths relative to `cwd` and limited to that subtree, the same scope a relative `readFile` path works in. The sweep therefore follows the project `rdy` was invoked in, never the repository a kit was loaded from.

`readTrackedSources` applies its filter before any read, so an excluded file is never read, and holds what it read for the life of the process. A file two kits both select is read once, and each kit reads only the files the other did not ask for. That cache lives here rather than in a kit because a compiled kit leaves its `readyup` imports unbundled, making `check-utils` one module instance across every kit of a run; a cache inside a bundled helper would be one per bundle. Listings are held the same way and are shared by checks that start together, which the runner does. The sweep never reads `node_modules/` or `.readyup/kits/*.js` whatever the filter returns for them -- the latter is readyup's own generated artifact, and sweeping it would report a kit's bundled source back to its author. That kit exclusion names the default `compile.outDir`; a project compiling its kits elsewhere excludes that directory itself. A caller wanting further exclusions applies them in its own filter.

The project declares the rest of what a sweep skips. A tracked file whose `.gitattributes` sets `linguist-generated` or `linguist-vendored` is dropped, so committed bundler output and vendored third-party code stay out of every kit's sweep at once: a finding inside one is advice nobody can take, and the file would count toward the adoption fraction the finding is reported against. Both attributes take a bare form and a `=true` form, and an explicit `=false` keeps the file in the sweep. The declaration is read through `git check-attr`, so the pattern syntax, the nested `.gitattributes` files, and the precedence rules are git's; no Linguist install is involved, and none of Linguist's built-in vendor heuristics apply. That also means the declaration need not be one the repository contains: git resolves `$GIT_DIR/info/attributes`, `core.attributesFile`, and the system-wide file alongside the tracked files, so a file missing from a sweep with nothing to explain it in the repository was declared in one of those. `check-attr` reads the working tree, so an uncommitted declaration takes effect, as it does for git itself. The exclusion belongs to `readTrackedSources` alone: `listTrackedFiles` stays the raw listing it is, so a check reading files from that listing itself applies whatever exclusions it wants.

It also reports the paths it returns to the run, which is the evidence a [pragma that suppressed nothing](running-checks.md#advisory-warnings) is judged against, so a check reading the project this way declares no `scanned` of its own and a sweep it reads in `skip` counts as much as one it reads in `check`. `listTrackedFiles` reports nothing, so a check taking that listing and reading the files itself declares `scanned`.

`blankNonCode` is what a detector scans instead of the raw text. It replaces every comment and every literal's text with spaces, so an idiom written in prose is invisible to an anchor scan while the code around the prose is not; a recommendation pointing at a comment is a false positive, and a false positive is what discredits a kit. Literal delimiters survive and only the text between them blanks, because a literal is an operand -- a scan reading the token before a `[` would otherwise take `'abc'[0]` for an array literal -- and an expression interpolated into a template literal stays visible as the code it is. Where a `/` could open a regular expression or divide, the ambiguity resolves toward division, and a quoted string or regular expression whose closing delimiter never appears on its line was neither, so a misjudgment leaves text standing rather than blanking an expression that runs. That direction holds because a `/` is classified against the operand before it, so every construct completing an operand has to present itself as one: a postfix operator -- `++`, `--`, and TypeScript's `!` -- attaches to its operand rather than replacing it, and a member name keeps the `.` or `#` that introduced it, so a property spelled like a keyword is read as the property it is. `>` is classified the other way, because `=>` obliges it to open a regular expression, so a JSX text node beginning with `/` blanks as far as its closing tag's slash. It reads JavaScript-family syntax; a source in another language yields arbitrary output rather than an error, so a filter selecting `.md` or `.yaml` paths should not reach for it.

`getLineAtOffset` turns an offset into the line `buildFindingReport` renders. The two pair: `blankNonCode` preserves its input's length and every line-break position, so an offset found in the blanked text names the same line in the source a reader opens.

`countPackageUsage` counts calls to the named exports and counts none in a source that never imports the package, from its root or any subpath. The import is what separates adoption from a name collision: a project hand-rolling its own `describeError` calls that name as often as an adopter calls the real one. Its two patterns read two texts -- the call scan reads a blanked source, so a call named in prose is not counted as one made, while the import test locates its match in a source with comments alone blanked, because the specifier it matches is itself a string literal that full blanking would erase, then reads the blanked text at that offset so a source quoting an import is not taken for one making it.

`buildFindingReport` takes every finding the project holds plus a predicate selecting the ones the calling check reports, and returns them as a `FindingOutcome` for the runner to suppress, render, and count. The runner names each reported finding as `symbol (path:line)`, or `path:line` where it declares no symbol, and derives the fraction from every finding passed rather than only the reported ones, so the checks of one run share a denominator the reader can compare across them.

Pass `ownImplementation` -- the package name, the export names, and the swept sources -- and every finding sited in that package's own implementation drops, from the detail and from both halves of the fraction. A declaration qualifies by being exported under one of the named exports from a file inside a workspace whose `package.json` names the package, so the repo publishing an idiom is not told it hand-rolled it. The same doctrine governs `hasMinDevDependencyVersion`: a repo that publishes a package is not a consumer of it. The rule is declaration-scoped, because a workspace is the whole repository in a single-package project, where a workspace-wide rule would turn the check off, and the argument goes one step further: the reasoning reaches the wrapper alone, so a neighbouring declaration in the same file is ordinary code and is still reported. A declaration owns the lines from its own head to the line before the next head, or to the file's last line where it is the last, because the closing brace is not a reliable end marker: a generic constraint and a return-type annotation can each hold braces of their own, and an overload signature has no body to close. A span cut short reports the implementation the rule exists to exempt. A re-exporting barrel declares no implementation and holds no exempted lines; a file in the package that declares the name without exporting it is a hand-roll and is still reported. A file that declares the export under another name and renames it on export from a second file is not recognized, which surfaces in the publishing repo itself rather than in a consumer's.

The [`rdy-ignore` pragma](running-checks.md#suppressing-a-finding) is honored by the runner rather than here, which is the layer holding both the check and the provenance a pragma naming that check is matched against. A kit passes nothing for it and recognizes nothing: the pragma is readyup's, so every kit reporting through this path speaks one dialect of it rather than each publishing its own. Give the check an `id` and a consumer can suppress its findings by name.

`undefined` is what a check skips on. Reporting it as a pass would say the project holds no hand-rolled sites, when what happened is that nothing was looked at.

```ts
import { blankNonCode, buildFindingReport, countPackageUsage, readTrackedSources } from 'readyup/check-utils';

function isSource(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path);
}

const check = {
  name: 'No source defines its own description helper',
  // The sweep is cached, so the skip and the check share one pass over the project.
  skip: async () => (await readTrackedSources(isSource)) === undefined && 'The project is not a git working tree',
  check: async () => {
    const sources = (await readTrackedSources(isSource)) ?? [];
    const findings = sources.flatMap((source) => listHandRolledSites(blankNonCode(source.text), source.path));
    const usage = { exportNames: ['describeError'], packageName: '@scope/errors' };
    const adoptedCount = countPackageUsage(sources, usage);

    return buildFindingReport({
      adoptedCount,
      findings,
      ownImplementation: { ...usage, sources },
      shouldReport: (finding) => finding.kind === 'clone',
    });
  },
};
```
