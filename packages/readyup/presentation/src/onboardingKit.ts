import type { KitModel } from './kitModel.ts';

/** The onboarding kit's page: whether a developer is set up to use the repo, with a required .env key unset and the VPN off. */
export const ONBOARDING_KIT: KitModel = {
  name: 'onboarding',
  command: 'rdy run onboarding',
  compiledWith: '0.43.0',
  conditions: [
    { id: 'deps', label: 'Dependencies are installed', on: true },
    { id: 'envfile', label: '.env is present', on: true },
    { id: 'envkeys', label: '.env sets every required key', on: false },
    { id: 'vpn', label: 'VPN is connected', on: false },
    { id: 'docker', label: 'Docker is running', on: true },
    { id: 'node', label: 'Node version matches .nvmrc', on: true },
    { id: 'hooks', label: 'Git hooks are installed', on: true },
  ],
  checklists: [
    {
      name: 'onboarding',
      ms: 1216,
      checks: [
        {
          name: 'Dependencies are installed',
          severity: 'error',
          when: 'deps',
          ms: 812,
          failDetail: 'node_modules is missing',
          fix: 'Run pnpm install',
        },
        {
          name: '.env is present',
          severity: 'error',
          when: 'envfile',
          failDetail: '.env is missing',
          fix: 'Copy .env.example to .env, then set each value',
          checks: [
            {
              name: '.env sets every required key',
              severity: 'error',
              when: 'envkeys',
              failDetail: 'DATABASE_URL is unset',
              fix: 'Set each key named above in .env; .env.example lists the keys',
            },
          ],
        },
        {
          name: 'VPN is connected',
          severity: 'error',
          when: 'vpn',
          ms: 1203,
          failDetail: 'No route to 10.0.0.0/8',
          fix: 'Connect to the office VPN, then run the checks again',
        },
        {
          name: 'Docker daemon is running',
          severity: 'warn',
          when: 'docker',
          ms: 388,
          fix: 'Start Docker Desktop; the database runs in a container',
        },
        {
          name: 'Node version matches .nvmrc',
          severity: 'warn',
          when: 'node',
          detail: 'v24.11.0 satisfies 24',
          failDetail: 'v22.12.0 does not satisfy 24',
          fix: 'Run nvm use, which reads .nvmrc',
        },
        {
          name: 'Git hooks are installed',
          severity: 'recommend',
          when: 'hooks',
          failDetail: '.git/hooks/pre-commit is missing',
          fix: 'Run pnpm lefthook install',
        },
      ],
    },
  ],
};
