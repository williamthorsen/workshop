import type { KitModel } from './kitModel.ts';

/** The preflight kit's page: whether the app is ready to launch, with its migrations pending. */
export const PREFLIGHT_KIT: KitModel = {
  name: 'preflight',
  command: 'rdy run preflight',
  compiledWith: '0.43.0',
  conditions: [
    { id: 'docker', label: 'Docker is running', on: true },
    { id: 'db', label: 'Database accepts connections', on: true },
    { id: 'migrations', label: 'Migrations are applied', on: false },
    { id: 'port', label: 'Port 3000 is free', on: true },
    { id: 'nodeenv', label: 'NODE_ENV is set', on: true },
  ],
  checklists: [
    {
      name: 'preflight',
      ms: 802,
      checks: [
        {
          name: 'Docker daemon is running',
          severity: 'error',
          when: 'docker',
          ms: 544,
          fix: 'Start Docker, then run the checks again',
        },
        {
          name: 'Database accepts connections',
          severity: 'error',
          when: 'db',
          ms: 212,
          failDetail: 'ECONNREFUSED 127.0.0.1:5432',
          fix: 'Run pnpm db:up, which starts the Postgres container',
          checks: [
            {
              name: 'Migrations are applied',
              severity: 'error',
              when: 'migrations',
              failDetail: '2 migrations pending: add_refunds, add_refund_index',
              fix: 'Run pnpm db:migrate',
            },
          ],
        },
        {
          name: 'Port 3000 is free',
          severity: 'warn',
          when: 'port',
          failDetail: 'PID 48122 (node) is listening on 3000',
          fix: 'Stop the process on port 3000, or set PORT in .env',
        },
        {
          name: 'NODE_ENV is set',
          severity: 'recommend',
          when: 'nodeenv',
          failDetail: 'NODE_ENV is unset',
          fix: 'Set NODE_ENV=development in .env',
        },
      ],
    },
  ],
};
