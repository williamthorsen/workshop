/** Starter rdy config file content. */
export const rdyConfigTemplate = `import { defineRdyConfig } from 'readyup';

/** Repo-level readyup settings. */
export default defineRdyConfig({
  compile: {
    srcDir: '.readyup/kits',
    outDir: '.readyup/kits',
  },
});
`;

/** Default rdy kit file content. */
export const rdyKitTemplate = `import { defineRdyKit } from 'readyup';

/**
 * Default rdy kit.
 *
 * Each checklist contains checks that run before a deployment or other operation.
 * Checks run concurrently within a checklist.
 *
 * Three fields, three questions: \`name\` states what must be true, phrased so it reads
 * true on a pass; \`detail\` answers why this status; \`fix\` says what to do about it.
 */
export default defineRdyKit({
  checklists: [
    {
      name: 'deploy',
      checks: [
        {
          name: 'NODE_ENV is set',
          check: () => {
            const value = process.env['NODE_ENV'];
            return { ok: Boolean(value), detail: value ?? 'NODE_ENV has no value in the environment' };
          },
          fix: 'Set NODE_ENV before deploying',
        },
      ],
    },
  ],
});
`;
