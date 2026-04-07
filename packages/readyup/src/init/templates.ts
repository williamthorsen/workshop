/** Starter rdy config file content. */
export const rdyConfigTemplate = `import { defineRdyConfig } from 'readyup';

/** Repo-level readyup settings. */
export default defineRdyConfig({
  compile: {
    srcDir: '.rdy/kits',
    outDir: '.rdy/kits',
  },
});
`;

/** Default rdy kit file content. */
export const rdyKitTemplate = `import { defineRdyKit } from 'readyup';

/**
 * Default rdy kit.
 *
 * Each checklist contains checks that run before a deployment or other operation.
 * Checks run concurrently within a checklist. Use \`fix\` to provide remediation hints.
 */
export default defineRdyKit({
  checklists: [
    {
      name: 'deploy',
      checks: [
        {
          name: 'environment variables set',
          check: () => Boolean(process.env['NODE_ENV']),
          fix: 'Set NODE_ENV before deploying',
        },
      ],
    },
  ],
});
`;
