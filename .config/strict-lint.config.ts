import type { StrictLintConfig } from '@williamthorsen/strict-lint';

import { deferredLintRules } from './eslint/deferred-lint-rules.ts';

const config: StrictLintConfig = {
  // Keep the deferred rules as warnings; strict-lint otherwise promotes every warning to an error.
  maxSeverity: deferredLintRules,
};

export default config;
