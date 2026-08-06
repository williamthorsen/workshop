import { advisoryRuleSeverities } from '@williamthorsen/eslint-config-typescript';
import { defineConfig } from '@williamthorsen/strict-lint/config';

import { deferredLintRules } from './eslint/deferred-lint-rules.ts';

const config = defineConfig({
  // Keep the deferred rules as warnings; strict-lint otherwise promotes every warning to an error.
  maxSeverity: {
    ...advisoryRuleSeverities,
    ...deferredLintRules,
  },
});

export default config;
