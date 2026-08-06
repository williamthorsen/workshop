import baseConfig, { createConfig } from '@williamthorsen/eslint-config-typescript';
import { defineConfig } from 'eslint/config';

import { deferredLintRules } from './.config/eslint/deferred-lint-rules.ts';

const config = defineConfig([
  ...baseConfig,
  {
    // Completely ignore these files
    ignores: ['**/*.sh', '**/.claude/**', '**/.readyup/**', '**/coverage/**', '**/dist/**', '**/local/**'],
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.tsx', '**/*.md/*.ts'],
    rules: deferredLintRules,
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
]);

export default config;
