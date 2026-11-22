import baseConfig, {
  commonIgnores,
  createConfig,
  patterns,
  toolIgnores,
} from '@williamthorsen/eslint-config-typescript';
import type { Linter } from 'eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// The broad blocks below match on the base config's `patterns`, the same constants it applies its own blocks to,
// save `no-restricted-syntax`, whose narrower scope `RESTRICTED_SYNTAX` states. Sharing the constants is what
// keeps a block here from overriding a base block it does not fully cover, which would drop this file's additions
// for the extensions it missed. The breadth is the shared config's position on which extensions a project may
// hold, and says nothing about which ones this repo contains.
//
// The layout guards further down are the opposite case and name `.ts` alone: a guard naming an extension asserts
// that a file of that kind belongs at the path it guards.

/**
 * The statement bans of the shared config's `no-restricted-syntax`, which every block here that sets the rule
 * restates.
 */
const STATEMENT_BANS = ['DebuggerStatement', 'LabeledStatement', 'WithStatement'];

/**
 * Every `no-restricted-syntax` entry that applies to TypeScript repo-wide.
 *
 * Shared because ESLint substitutes a rule's options across config objects instead of merging them, so an object
 * that sets this rule for a narrower glob discards every entry it does not restate. The statement bans come from the
 * shared config and would be lost the same way.
 *
 * The scope is TypeScript alone, though the base block this overrides also covers `patterns.javaScriptFiles`. A `.js`
 * file keeps the shared config's own `describeError` entry, which reports only a ternary whose fallback is
 * `String(error)`; the entry here reports one with any fallback.
 */
const RESTRICTED_SYNTAX = [
  ...STATEMENT_BANS,
  {
    // Constraining the consequent to a `.message` read is what leaves the other `instanceof Error` shapes alone: an
    // `if` that narrows before reading an errno, and the ternary that coerces an unknown value into an `Error`.
    selector:
      'ConditionalExpression[test.operator="instanceof"][test.right.name="Error"][consequent.property.name="message"]',
    message: 'Use `describeError` from @williamthorsen/toolbelt.errors to read a message off an unknown thrown value.',
  },
];

/**
 * The modules permitted at the root of each package's `src/`, keyed by package directory.
 *
 * Every package's source is grouped by role, so a module at the root of `src/` belongs in a directory. A permitted
 * module names the package, or an entry point to it, rather than a role within it.
 */
const ROOT_MODULES: Readonly<Record<string, readonly string[]>> = {
  'atlassian-tools': [],
  'chrome-tools': [],
  // The exceptions are the entry point and the version accessor.
  compositor: ['getEngineVersion.ts', 'index.ts'],
  'demo-tools': [],
  'git-tools': [],
  // The one exception is the entry point.
  'launchd-agent': ['index.ts'],
  // The one exception is the entry point.
  'nodejs-tools': ['index.ts'],
  'npm-tools': [],
  // The exceptions name the package rather than a role within it.
  overlay: ['index.ts', 'overlay.ts'],
  // The exceptions name the package rather than a role within it.
  readyup: ['index.ts', 'readyupResolverHook.ts', 'version.ts'],
  'repo-tools': [],
  'secret-tools': [],
  // The one exception is the entry point.
  'systemd-service': ['index.ts'],
  // The one exception is the entry point.
  'tank-redis': ['index.ts'],
};

const config = defineConfig([
  ...baseConfig,
  // The two lists published by the shared config, plus the entries specific to this repo, each kept byte for byte:
  // compositor's samples and the deck's bundle are generator output pinned by a drift test, and the deck's captures are
  // recorded `rdy run` output. `nmr lint` resolves to `eslint --fix .`, so a fix applied there would rewrite them.
  // `.prettierignore` excludes them on the same grounds.
  globalIgnores([
    ...commonIgnores,
    ...toolIgnores,
    'packages/compositor/samples/**',
    'packages/readyup/presentation/captures/**',
    'packages/readyup/presentation/deck.js',
  ]),
  {
    // `strict-lint` promotes rule severities and not this report, so the default `warn` would leave a directive
    // whose rule has stopped reporting in place indefinitely.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
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
      'sky-pilot/helpers-last': 'error',
    },
  },
  defineConfig({
    files: patterns.testFiles,
    extends: [await createConfig.vitest()],
  }),
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
    // A bin wrapper imports only node builtins, so that a missing dependency cannot replace its build-first message,
    // and the shared `describeError` helper is therefore out of its reach.
    files: ['packages/*/bin/*.js'],
    rules: {
      'no-restricted-syntax': ['error', ...STATEMENT_BANS],
    },
  },
  ...Object.entries(ROOT_MODULES).map(([pkg, rootModules]) => buildLayoutGuard(pkg, rootModules)),
  {
    // Each demo repository installs demo-tools' aidemo peer. The package's tests run a fake aidemo, so the workspace
    // does not install the real one as a devDependency.
    files: ['packages/demo-tools/package.json'],
    rules: {
      'package-json/specify-peers-locally': 'off',
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

// region | Helpers
/**
 * Builds the layout guard that reports every module at the root of a package's `src/` save the permitted ones.
 *
 * The `Program` selector matches every file that the glob admits, which is the point: the finding is the file's
 * presence, not anything it contains.
 */
function buildLayoutGuard(pkg: string, rootModules: readonly string[]): Linter.Config {
  const permitted =
    rootModules.length === 0
      ? 'No module belongs'
      : `Only ${new Intl.ListFormat('en', { type: 'conjunction' }).format(rootModules)} ${rootModules.length === 1 ? 'belongs' : 'belong'}`;
  return {
    files: [`packages/${pkg}/src/*.ts`],
    ...(rootModules.length > 0 && { ignores: rootModules.map((name) => `packages/${pkg}/src/${name}`) }),
    rules: {
      'no-restricted-syntax': [
        'error',
        ...RESTRICTED_SYNTAX,
        {
          selector: 'Program',
          message: `Group this module into a directory named for its role. ${permitted} at the root of ${pkg}/src.`,
        },
      ],
    },
  };
}
// endregion | Helpers
