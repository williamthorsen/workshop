import config from '@williamthorsen/eslint-config-typescript';

/**
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  ...config,
  {
    // Completely ignore these files
    ignores: ['**/*.sh', '**/.claude/**', '**/.readyup/**', '**/coverage/**', '**/dist/**', '**/local/**'],
  },
  {
    // Deferred (#116): eslint-config-typescript v6 enables these at `error`, but readyup's existing
    // code predates them. Kept as warnings here and allowlisted in `.config/strict-lint.config.ts`
    // so `lint:check` and `lint:strict` pass; remove entries from both as violations are fixed.
    // Scoped to TypeScript files, where the base config registers the `unicorn` plugin and where
    // every deferred violation lives.
    files: ['**/*.ts', '**/*.mts', '**/*.tsx', '**/*.md/*.ts'],
    rules: {
      'preserve-caught-error': 'warn',
      'unicorn/consistent-conditional-object-spread': 'warn',
      'unicorn/max-nested-calls': 'warn',
      'unicorn/no-computed-property-existence-check': 'warn',
      'unicorn/no-declarations-before-early-exit': 'warn',
      'unicorn/no-duplicate-if-branches': 'warn',
      'unicorn/no-negated-array-predicate': 'warn',
      'unicorn/no-return-array-push': 'warn',
      'unicorn/no-top-level-assignment-in-function': 'warn',
      'unicorn/no-unreadable-for-of-expression': 'warn',
      'unicorn/prefer-await': 'warn',
      'unicorn/prefer-continue': 'warn',
      'unicorn/prefer-else-if': 'warn',
      'unicorn/prefer-https': 'warn',
      'unicorn/prefer-includes-over-repeated-comparisons': 'warn',
      'unicorn/prefer-simple-condition-first': 'warn',
      'unicorn/prefer-split-limit': 'warn',
      'unicorn/prefer-string-repeat': 'warn',
      'unicorn/prefer-unicode-code-point-escapes': 'warn',
      'unicorn/require-array-sort-compare': 'warn',
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.ts', '**/*.tsx'],
    rules: {
      'n/no-extraneous-import': 'off',
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
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
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
];
