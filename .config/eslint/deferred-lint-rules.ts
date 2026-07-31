// `@williamthorsen/eslint-config-typescript` added unicorn rules that surface violations in existing code.
// Errors are downgraded to warnings here until the violations are fixed; #152 and #153 clear the remainder.
export const deferredLintRules = {
  'unicorn/no-computed-property-existence-check': 'warn',
  'unicorn/no-declarations-before-early-exit': 'warn',
  'unicorn/no-duplicate-if-branches': 'warn',
  'unicorn/no-return-array-push': 'warn',
  'unicorn/no-top-level-assignment-in-function': 'warn',
  'unicorn/no-unreadable-for-of-expression': 'warn',
  'unicorn/prefer-await': 'warn',
  'unicorn/prefer-else-if': 'warn',
  'unicorn/prefer-includes-over-repeated-comparisons': 'warn',
  'preserve-caught-error': 'warn',
} as const;
