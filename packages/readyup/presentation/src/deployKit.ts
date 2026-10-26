import type { KitModel } from './kits.ts';

/** The deploy checklist that "A run, step by step" walks through, with its build and environment broken. */
export const DEPLOY_KIT: KitModel = {
  name: 'deploy',
  command: 'rdy run deploy',
  conditions: [
    { id: 'build', label: 'The build output is present', on: false },
    { id: 'env', label: 'NODE_ENV is set', on: false },
  ],
  checklists: [
    {
      name: 'deploy',
      ms: 41,
      checks: [
        {
          name: 'package.json exists',
          severity: 'error',
          checks: [
            {
              name: 'build output present',
              severity: 'error',
              when: 'build',
              failDetail: 'dist/index.js not found',
              fix: 'Run pnpm build, then run the checks again',
              checks: [
                { name: 'bundle under 500 kB', severity: 'error' },
                { name: 'source maps excluded', severity: 'warn' },
              ],
            },
          ],
        },
        {
          name: 'NODE_ENV is set',
          severity: 'warn',
          when: 'env',
          failDetail: 'NODE_ENV is unset',
          fix: 'Set NODE_ENV=production in the deploy environment',
        },
        { name: 'base image is pinned', severity: 'warn', na: 'no Dockerfile in this repository' },
      ],
    },
  ],
};
