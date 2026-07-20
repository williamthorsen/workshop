import type { StrictLintConfig } from '@williamthorsen/strict-lint';

/**
 * Rules that eslint-config-typescript v6 enables at `error` but readyup's existing code predates.
 * Kept as warnings (not promoted to errors by strict-lint) pending burndown in #116.
 * Remove each entry — here and in `eslint.config.js` — as its violations are fixed.
 */
const config: StrictLintConfig = {
  maxSeverity: {
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
};

export default config;
