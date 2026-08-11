import baseConfig, { createConfig } from '@williamthorsen/eslint-config-typescript';
import { defineConfig } from 'eslint/config';

/**
 * Every `no-restricted-syntax` entry that applies to TypeScript repo-wide.
 *
 * Shared because ESLint substitutes a rule's options across config objects instead of merging them, so an object
 * that sets this rule for a narrower glob discards every entry it does not restate. The three statement bans come
 * from the shared config and would be lost the same way.
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
    // `prefer-simple-condition-first` reorders conditions to save a property read, at the cost of the reading
    // order the surrounding error messages use. Its own diagnostic concedes it cannot verify the reorder is safe.
    files: ['**/*.ts', '**/*.mts', '**/*.tsx', '**/*.md/*.ts'],
    rules: {
      'unicorn/prefer-simple-condition-first': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.ts', '**/*.tsx'],
    rules: {
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.tsx', '**/*.md/*.ts'],
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
    files: ['**/*.test.ts', '**/*.test.tsx'],
    extends: [await createConfig.vitest()],
  }),
  {
    // Config files legitimately mutate and compose configuration objects at module top level.
    files: ['**/*.config.{cjs,js,mjs,ts}', '**/config/**'],
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
    files: ['**/*.ts', '**/*.mts', '**/*.tsx', '**/*.md/*.ts'],
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
]);

export default config;
