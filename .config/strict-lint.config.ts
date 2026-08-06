import { advisoryRuleSeverities } from '@williamthorsen/eslint-config-typescript';
import { defineConfig } from '@williamthorsen/strict-lint/config';

const config = defineConfig({
  maxSeverity: advisoryRuleSeverities,
});

export default config;
