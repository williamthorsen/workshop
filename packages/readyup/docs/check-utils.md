# Check utilities

Reusable check functions for common assertions:

```ts
import { fileExists, hasPackageJsonField } from 'readyup/check-utils';
```

Every path that a check utility takes resolves against `cwd` unless it is absolute, in which case it names the file itself; `filesExist` applies that rule to `baseDir` too, and an absolute entry in its list outranks the base directory.

Each utility's doc comment states its edge cases and the reasons for its rules. An editor shows the comment on hover; in the published package, it is in the declaration file from which `dist/esm/check-utils/index.d.ts` re-exports the utility. This file is for choosing a utility.

## Outcomes

| Function                                  | Returns                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| `missingFrom(category, expected, actual)` | `CheckOutcome` with fraction progress over any collection |

`filesExist` and `hasJsonFields` are built from `missingFrom`. Call it directly to count anything else.

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

`projectJsonFile` returns what [`pickJson`](authoring-kits.md#inlining-json-at-compile-time) inlines: the paths that it names, projected out of the file and serialized. A check reading an entry's [recorded inputs](publishing-kits.md#what-a-manifest-entry-records) calls it to decide an inlined JSON file the same way the compile that recorded it did.

## Package manifests

| Function                                              | Returns                                   |
| ----------------------------------------------------- | ----------------------------------------- |
| `readPackageJson()`                                   | Parsed `package.json`                     |
| `hasPackageJsonField(field, value?)`                  | Field exists, optionally matching a value |
| `hasDevDependency(name)`                              | Dev dependency is declared                |
| `hasMinDevDependencyVersion(name, version, options?)` | Dev dependency meets a minimum            |

## Versions and runtime alignment

| Function                             | Returns                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `compareVersions(a, b)`              | Comparison of two semver strings                                                         |
| `readEnginesNodeFloor(manifest)`     | `{ kind: 'found', floor, raw }`, `{ kind: 'absent' }`, or `{ kind: 'unparseable', raw }` |
| `satisfiesNodeFloor(version, floor)` | Whether a runtime meets a floor; `undefined` if either is uncomparable                   |
| `readToolVersionsNode(path?)`        | Node version declared in `.tool-versions`                                                |
| `esYearForNodeMajor(major)`          | ECMAScript year supported by a Node major (`24` → `es2025`)                              |
| `readTsconfigLanguageLevel(path)`    | Effective `lib` and `target`, resolved through `extends`                                 |
| `readTsconfigChain(path)`            | Each config in the `extends` chain, and what it declares in its own right                |

Each reader reports only what it can see, so a check composing them decides for itself what each unknown means. Call `readTsconfigChain` to find out which config declared a setting, or to read a field that the language-level reader does not cover, such as `files` or `include`.

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

| Function                       | Returns                                                |
| ------------------------------ | ------------------------------------------------------ |
| `discoverWorkspaces(options?)` | The repo root and every member, as `Workspace` entries |

`discoverWorkspaces` collapses pnpm, npm, and yarn monorepo conventions -- and single-workspace repos -- into one iteration shape. Each entry has `dir` (relative to `cwd`; `'.'` for the repo root), `absolutePath`, `name`, `isPackage` (`package.json.private !== true`), `isRoot`, and the parsed `packageJson`.

```ts
const members = discoverWorkspaces({ filter: (w) => !w.isRoot });
const packages = discoverWorkspaces({ filter: (w) => w.isPackage });
```

A kit test that needs a `Workspace` value builds one with `makeWorkspace`; see [Testing a kit](authoring-kits.md#testing-a-kit).

## Kit packages

| Function                        | Returns                                                 |
| ------------------------------- | ------------------------------------------------------- |
| `discoverKitPackages(fromDir?)` | Installed direct dependencies that publish kits, sorted |

```ts
const missing = discoverKitPackages().filter((name) => !configuredPackages.includes(name));
```

## Project sources

| Function                              | Returns                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `listTrackedFiles()`                  | Paths under `cwd` tracked by git                                   |
| `readTrackedSources(filter?)`         | `{ path, text }` for each tracked path selected by the filter      |
| `blankNonCode(text)`                  | The same text with every comment and literal blanked               |
| `getLineAtOffset(text, offset)`       | The 1-based line containing an offset                              |
| `countPackageUsage(sources, options)` | Calls into a package, counted only when the source imports it      |
| `buildFindingReport(options)`         | A `FindingOutcome` that the runner suppresses, renders, and counts |

These six are what an adoption kit needs -- one reporting where a project hand-rolls what a package that it already installed provides.

The paths that `readTrackedSources` returns count toward the evidence on which the run reports a [pragma that suppressed nothing](running-checks.md#advisory-warnings).

The runner applies the [`rdy-ignore` pragma](running-checks.md#suppressing-a-finding) to the findings that `buildFindingReport` returns.

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
