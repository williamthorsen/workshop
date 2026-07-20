// Rules that `@williamthorsen/eslint-config-typescript` v6 enables at `error` but readyup's existing code
// predates. Holding them at `warn` — via `eslint.config.ts` for `lint:check`, and via strict-lint's
// `maxSeverity` in `strict-lint.config.ts` for `lint:strict` — lets both gates pass while #116 burns the
// violations down. Remove an entry here to restore the rule to `error` in both gates.
export const deferredLintRules = {
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
} as const;
