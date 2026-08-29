import { defineRdyKit } from 'readyup';

/**
 * Default readyup kit.
 *
 * Each checklist contains checks that run before a deployment or other operation.
 * Checks run concurrently within a checklist.
 *
 * Three fields, three questions: `name` states what must be true, phrased so it reads
 * true on a pass; `detail` explains why this status; `fix` says what to do about it.
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
            if (!value) return { ok: false, detail: 'NODE_ENV has no value in the environment' };
            return { ok: true, detail: `NODE_ENV is ${value}` };
          },
          fix: 'Set NODE_ENV before deploying',
        },
      ],
    },
  ],
});
