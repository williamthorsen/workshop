// `@williamthorsen/eslint-config-typescript` v6 added new unicorn rules, surfacing new violations in existing code.
// Errors are downgraded to warnings here until a decision is made whether to remove the rule or fix the violations.
export const deferredLintRules = {
  'preserve-caught-error': 'warn',
  'unicorn/max-nested-calls': 'warn',
  'unicorn/no-computed-property-existence-check': 'warn',
  'unicorn/no-declarations-before-early-exit': 'warn',
  'unicorn/no-duplicate-if-branches': 'warn',
  'unicorn/no-return-array-push': 'warn',
  'unicorn/no-top-level-assignment-in-function': 'warn',
  'unicorn/no-unreadable-for-of-expression': 'warn',
  'unicorn/prefer-await': 'warn',
  'unicorn/prefer-else-if': 'warn',
  'unicorn/prefer-includes-over-repeated-comparisons': 'warn',
  'unicorn/prefer-simple-condition-first': 'warn',
  'unicorn/require-array-sort-compare': 'warn',
} as const;
