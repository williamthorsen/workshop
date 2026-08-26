import baseConfig, { createConfig, patterns } from '@williamthorsen/eslint-config-typescript';
import { defineConfig } from 'eslint/config';

// The broad blocks below match on the base config's `patterns`, the same constants it applies its own blocks to,
// save `no-restricted-syntax`, whose narrower scope `RESTRICTED_SYNTAX` states. Sharing the constants is what
// keeps a block here from overriding a base block it does not fully cover, which would drop this file's additions
// for the extensions it missed. The breadth is the shared config's position on which extensions a project may
// hold, and says nothing about which ones this repo contains.
//
// The layout guards further down are the opposite case and name `.ts` alone: a guard naming an extension asserts
// that a file of that kind belongs at the path it guards.

/**
 * Every `no-restricted-syntax` entry that applies to TypeScript repo-wide.
 *
 * Shared because ESLint substitutes a rule's options across config objects instead of merging them, so an object
 * that sets this rule for a narrower glob discards every entry it does not restate. The three statement bans come
 * from the shared config and would be lost the same way.
 *
 * The scope is TypeScript alone, though the base block this overrides also covers `patterns.javaScriptFiles`. The
 * `describeError` entry answers the `unknown` type TypeScript gives a catch binding, which JavaScript has no
 * equivalent of, so a `.js` file receives the three statement bans without it.
 */
const RESTRICTED_SYNTAX = [
  'DebuggerStatement',
  'LabeledStatement',
  'WithStatement',
  {
    // Constraining the consequent to a `.message` read is what leaves the other `instanceof Error` shapes alone: an
    // `if` that narrows before reading an errno, and the ternary that coerces an unknown value into an `Error`.
    selector:
      'ConditionalExpression[test.operator="instanceof"][test.right.name="Error"][consequent.property.name="message"]',
    message: 'Use `describeError` from @williamthorsen/toolbelt.errors to read a message off an unknown thrown value.',
  },
];

const config = defineConfig([
  ...baseConfig,
  {
    // Completely ignore these files
    ignores: ['**/*.sh', '**/.claude/**', '**/.readyup/**', '**/coverage/**', '**/dist/**', '**/local/**'],
  },
  {
    files: patterns.codeFiles,
    rules: {
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
    },
  },
  {
    files: patterns.typeScriptFiles,
    languageOptions: {
      parserOptions: {
        // Anchor the project service (enabled by the base config) at the repo root.
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-confusing-void-expression': [
        'warn',
        {
          ignoreArrowShorthand: true,
          ignoreVoidOperator: true,
          ignoreVoidReturningFunctions: true,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowBoolean: true,
          allowNumber: true,
        },
      ],
    },
  },
  defineConfig({
    files: patterns.testFiles,
    extends: [await createConfig.vitest()],
  }),
  {
    // The suites taking their trees as fixtures bind `test.extend(...)` to `it`, and some of them register
    // `it.aroundAll(...)` or `it.aroundEach(...)`, which @vitest/eslint-plugin 1.6.27 misreads twice:
    // `consistent-test-it` compares the resolved import name (`test`) rather than the local binding, so every
    // describe-nested `it(...)` is a false positive; and `require-hook`'s call-chain table lacks both hooks,
    // so the registration reads as bare top-level code. Both are plugin defects; delete this block when the
    // upstream fixes land:
    // https://github.com/vitest-dev/eslint-plugin-vitest/issues/955 (require-hook) and
    // https://github.com/vitest-dev/eslint-plugin-vitest/issues/956 (consistent-test-it).
    //
    // The list grows per migrated suite rather than the preamble collapsing into a shared helper: an imported
    // `it` traces back to no vitest export, at which point the plugin stops applying every vitest rule to the
    // file.
    files: [
      'packages/readyup/src/bin/__tests__/route.compiledWithReporting.unit.test.ts',
      'packages/readyup/src/bin/__tests__/route.detailProjection.unit.test.ts',
      'packages/readyup/src/bin/__tests__/route.exitCodes.tool.test.ts',
      'packages/readyup/src/bin/__tests__/route.partialResults.unit.test.ts',
      'packages/readyup/src/bin/__tests__/route.styleSelection.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/discoverKitPackages.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/filesystem.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/hashing.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/json.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/package-json.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/tool-versions.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/tsconfig.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/workspaces.caching.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/workspaces.cwd.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/workspaces.unit.test.ts',
      'packages/readyup/src/check-utils/__tests__/workspaces.walk.unit.test.ts',
      'packages/readyup/src/check-utils/project/__tests__/buildFindingReport.unit.test.ts',
      'packages/readyup/src/check-utils/project/__tests__/listOwnImplementationSpans.unit.test.ts',
      'packages/readyup/src/check-utils/project/__tests__/listTrackedFiles.tool.test.ts',
      'packages/readyup/src/check-utils/project/__tests__/readTrackedSources.unit.test.ts',
      'packages/readyup/src/installed-packages/__tests__/collectKitPackageGroups.unit.test.ts',
      'packages/readyup/src/installed-packages/__tests__/expandConfiguredPackages.unit.test.ts',
      'packages/readyup/src/installed-packages/__tests__/expandConfiguredPackages.workspaces.unit.test.ts',
      'packages/readyup/src/list/__tests__/listCommand.packages.unit.test.ts',
      'packages/readyup/src/list/__tests__/listCommand.recursive.unit.test.ts',
      'packages/readyup/src/list/__tests__/listCommand.recursivePackages.unit.test.ts',
      'packages/readyup/src/portable/__tests__/walkDirectories.unit.test.ts',
      'packages/readyup/src/projects/__tests__/project-discovery.unit.test.ts',
      'packages/readyup/src/run/__tests__/pragma-report.unit.test.ts',
      'packages/readyup/src/run/__tests__/pragmaRecording.wiring.unit.test.ts',
      'packages/readyup/src/run/__tests__/qualifiedSuppression.wiring.unit.test.ts',
      'packages/readyup/src/run/__tests__/resolveConfiguredPackages.unit.test.ts',
      'packages/readyup/src/run/__tests__/resolveFindingOutcome.unit.test.ts',
      'packages/readyup/src/testing/__tests__/makeWorkspace.unit.test.ts',
    ],
    rules: {
      'vitest/consistent-test-it': 'off',
      'vitest/require-hook': ['warn', { allowedFunctionCalls: ['it.aroundAll', 'it.aroundEach'] }],
    },
  },
  {
    // Config files legitimately mutate and compose configuration objects at module top level.
    files: [...patterns.codeExtensions.map((extensions) => `**/*.config.${extensions}`), '**/config/**'],
    rules: {
      'unicorn/no-top-level-side-effects': 'off',
    },
  },
  {
    files: ['**/scripts/**/*'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: patterns.typeScriptFiles,
    rules: {
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX],
    },
  },
  {
    // readyup's source is grouped by role, so a module at the root of `src/` belongs in a directory. The three
    // exceptions name the package rather than a role within it. The selector matches every file the glob admits,
    // which is the point: the finding is the file's presence, not anything it contains.
    files: ['packages/readyup/src/*.ts'],
    ignores: [
      'packages/readyup/src/index.ts',
      'packages/readyup/src/readyupResolverHook.ts',
      'packages/readyup/src/version.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...RESTRICTED_SYNTAX,
        {
          selector: 'Program',
          message:
            'Group this module into a directory named for its role. Only index.ts, readyupResolverHook.ts, and version.ts belong at the root of readyup/src.',
        },
      ],
    },
  },
  {
    // overlay's source is grouped by role on the same terms, and its two exceptions likewise name the package.
    files: ['packages/overlay/src/*.ts'],
    ignores: ['packages/overlay/src/index.ts', 'packages/overlay/src/overlay.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...RESTRICTED_SYNTAX,
        {
          selector: 'Program',
          message:
            'Group this module into a directory named for its role. Only index.ts and overlay.ts belong at the root of overlay/src.',
        },
      ],
    },
  },
  {
    // compositor's root follows on the same terms; its exceptions are the entry point and the version accessor.
    files: ['packages/compositor/src/*.ts'],
    ignores: ['packages/compositor/src/getEngineVersion.ts', 'packages/compositor/src/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...RESTRICTED_SYNTAX,
        {
          selector: 'Program',
          message:
            'Group this module into a directory named for its role. Only getEngineVersion.ts and index.ts belong at the root of compositor/src.',
        },
      ],
    },
  },
  {
    // `utils` names no role, so a directory of that name under any package's source is the same defect one level
    // down. The path segment must be exactly `utils`, which leaves `check-utils` and `test-utils` untouched.
    files: ['packages/*/src/**/utils/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...RESTRICTED_SYNTAX,
        {
          selector: 'Program',
          message: 'Group this module into a directory named for its role. `utils` names no role.',
        },
      ],
    },
  },
]);

export default config;
