// `@williamthorsen/eslint-config-typescript` added unicorn rules that surface violations in existing code.
// Errors are downgraded to warnings here until the violations are fixed; #153 clears the remainder.
export const deferredLintRules = {
  'unicorn/no-declarations-before-early-exit': 'warn',
  'unicorn/no-duplicate-if-branches': 'warn',
  'unicorn/no-return-array-push': 'warn',
  'unicorn/no-unreadable-for-of-expression': 'warn',
  'unicorn/prefer-await': 'warn',
  'unicorn/prefer-else-if': 'warn',
  'unicorn/prefer-includes-over-repeated-comparisons': 'warn',
  'preserve-caught-error': 'warn',
} as const;

export const deferredTestRules = {
  'vitest/no-conditional-expect': 'warn',
  'vitest/no-conditional-in-test': 'warn',
  'vitest/require-to-throw-message': 'warn',
  'vitest/require-top-level-describe': 'warn',
} as const;
