import type { KitModel } from './kitModel.ts';

/** The preflight kit that the captures recorded, whose run with both conditions off is the title slide's. */
export const CAPTURED_PREFLIGHT: KitModel = {
  name: 'preflight',
  command: 'rdy run preflight',
  compiledWith: '0.42.0',
  conditions: [
    { id: 'docker', label: 'Docker is running', on: true },
    { id: 'api', label: 'API is listening on port 3000', on: true },
  ],
  checklists: [
    {
      name: 'preflight',
      ms: 546,
      checks: [
        {
          name: 'Docker daemon is running',
          severity: 'error',
          when: 'docker',
          ms: 544,
          fix: 'Start Docker, then run the checks again',
        },
        {
          name: 'API is listening on port 3000',
          severity: 'warn',
          when: 'api',
          ms: 45,
          failDetail: 'Nothing is listening on port 3000',
          fix: 'Start the API with pnpm dev before the smoke test',
        },
      ],
    },
  ],
};

/** The readyup version that recorded the captures, and the one that the deck reports as its own. */
export const CAPTURED_READYUP_VERSION = '0.42.0';
