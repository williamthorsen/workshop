import type { Severity } from '../../src/kits/types.ts';
import type { JsonKitOrigin } from '../../src/schemas/reportSchema.ts';

/** The readyup version that recorded the captures, and the one that the deck reports as its own. */
export const CAPTURED_READYUP_VERSION = '0.42.0';

/** A switch in a kit page's environment panel. */
export interface ConditionModel {
  id: string;
  label: string;
  on: boolean;
}

/**
 * A check as a kit page models it.
 *
 * A check passes when it has no `when` or when its condition is on, and otherwise fails at its severity. `na` makes it
 * skip whatever the environment, and `findings` marks a check that reports the files that it examined. A findings check
 * that declares `examined`, the number of files that it examined, and `sites`, each `path:line` at which it fails, has
 * its progress and its failure detail derived from them.
 */
export interface CheckModel {
  name: string;
  severity: Severity;
  checks?: CheckModel[];
  detail?: string;
  examined?: number;
  failDetail?: string;
  findings?: boolean;
  fix?: string;
  id?: string;
  ms?: number;
  na?: string;
  progress?: [passedCount: number, count: number];
  sites?: string[];
  when?: string;
}

/** A checklist as a kit page models it, with the duration that its count line reports. */
export interface ChecklistModel {
  name: string;
  ms: number;
  checks: CheckModel[];
}

/**
 * A kit's model: the command that runs it, its checklists, the conditions that its environment panel toggles, and its
 * provenance.
 */
export interface KitModel {
  name: string;
  checklists: ChecklistModel[];
  command: string;
  compiledWith?: string;
  conditions: ConditionModel[];
  origin?: JsonKitOrigin;
}

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

/** The model of each kit page, keyed by the page's `data-kit`. */
export const KITS = {
  onboarding: {
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
  },
  preflight: {
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
  },
  adoption: {
    name: 'default',
    command: 'rdy run --from npm:@acme/ui',
    origin: { source: 'npm:@acme/ui', version: '5.0.0' },
    compiledWith: '0.43.0',
    conditions: [
      { id: 'button', label: 'Buttons import from @acme/ui/button', on: false },
      { id: 'modal', label: 'Modals pass open, not isOpen', on: true },
      { id: 'field', label: 'Inputs are wrapped in a Field', on: true },
      { id: 'legacy', label: 'Nothing imports @acme/ui/legacy', on: false },
    ],
    checklists: [
      {
        name: 'adoption',
        ms: 412,
        checks: [
          {
            name: 'Every Button is imported from @acme/ui/button',
            id: 'acme-ui/button-entry',
            severity: 'warn',
            when: 'button',
            ms: 131,
            findings: true,
            examined: 41,
            sites: ['src/checkout/Pay.tsx:4', 'src/account/Profile.tsx:7', 'src/admin/Users.tsx:3'],
            fix: 'Import Button from @acme/ui/button at each site above; the root entry pulls in every component',
          },
          {
            name: 'No Modal passes the removed isOpen prop',
            id: 'acme-ui/modal-open',
            severity: 'error',
            when: 'modal',
            ms: 118,
            findings: true,
            examined: 11,
            sites: ['src/billing/Invoice.tsx:58', 'src/admin/Users.tsx:112'],
            fix: 'Rename isOpen to open at each site above; v5 ignores isOpen, so the modal never opens',
          },
          {
            name: 'Every input is wrapped in a Field',
            id: 'acme-ui/field-wrapper',
            severity: 'warn',
            when: 'field',
            ms: 104,
            findings: true,
            examined: 27,
            sites: ['src/account/Address.tsx:31', 'src/account/Address.tsx:47'],
            fix: 'Wrap each input above in a Field, which renders the label and the error for it',
          },
          {
            name: 'No source imports from @acme/ui/legacy',
            id: 'acme-ui/no-legacy-entry',
            severity: 'recommend',
            when: 'legacy',
            findings: true,
            examined: 41,
            sites: ['src/reports/Export.tsx:2'],
            fix: "Import from the component's own entry; @acme/ui/legacy is removed in v6",
          },
        ],
      },
    ],
  },
  migration: {
    name: 'default',
    command: 'rdy run --from npm:@acme/http-client',
    origin: { source: 'npm:@acme/http-client', version: '3.1.0' },
    compiledWith: '0.43.0',
    conditions: [
      { id: 'create', label: 'Clients are created with createClient', on: false },
      { id: 'timeout', label: 'No request passes timeout', on: false },
      { id: 'rawbody', label: 'No call reads rawBody', on: true },
      { id: 'retries', label: 'Retries are set on the client', on: false },
    ],
    checklists: [
      {
        name: 'migration',
        ms: 604,
        checks: [
          {
            name: 'Every client is created with createClient',
            id: 'acme-http/create-client',
            severity: 'error',
            when: 'create',
            ms: 212,
            findings: true,
            examined: 17,
            sites: ['src/api/orders.ts:12', 'src/api/users.ts:8', 'src/jobs/sync.ts:21'],
            fix: 'Replace new HttpClient(options) with createClient(options) at each site above; the constructor is removed in v3',
          },
          {
            name: 'No request passes the removed timeout option',
            id: 'acme-http/no-timeout-option',
            severity: 'error',
            when: 'timeout',
            ms: 140,
            findings: true,
            examined: 17,
            sites: ['src/api/orders.ts:40', 'src/api/reports.ts:19'],
            fix: 'Pass signal: AbortSignal.timeout(ms) instead; v3 ignores timeout',
          },
          {
            name: 'No call reads response.rawBody',
            id: 'acme-http/no-raw-body',
            severity: 'error',
            when: 'rawbody',
            ms: 131,
            findings: true,
            examined: 17,
            sites: ['src/api/reports.ts:52'],
            fix: 'Read the body through response.json() or response.text(); rawBody is removed in v3',
          },
          {
            name: 'Retries are configured on the client, not per call',
            id: 'acme-http/client-retries',
            severity: 'recommend',
            when: 'retries',
            ms: 121,
            findings: true,
            examined: 17,
            sites: ['src/api/orders.ts:44', 'src/api/users.ts:30'],
            fix: 'Move retries to createClient; per-call retries are removed in v4',
          },
        ],
      },
    ],
  },
  it: {
    name: 'default',
    command: 'rdy run --from github:acme/diagnose',
    origin: { source: 'github:acme/diagnose', version: 'main' },
    compiledWith: '0.43.0',
    conditions: [
      { id: 'os', label: 'macOS is 15 or later', on: true },
      { id: 'filevault', label: 'FileVault is on', on: false },
      { id: 'vpn', label: 'VPN profile is installed', on: true },
      { id: 'chrome', label: 'Managed Chrome is installed', on: true },
      { id: 'node', label: 'Node 24 through asdf', on: true },
      { id: 'brew', label: 'Homebrew is current', on: false },
    ],
    checklists: [
      {
        name: 'machine',
        ms: 1402,
        checks: [
          {
            name: 'macOS is 15 or later',
            severity: 'error',
            when: 'os',
            detail: 'macOS 15.6',
            failDetail: 'macOS 14.7',
            fix: 'Update macOS from System Settings › General › Software Update',
          },
          {
            name: 'FileVault is on',
            severity: 'error',
            when: 'filevault',
            ms: 118,
            failDetail: 'FileVault is off',
            fix: 'Turn on FileVault in System Settings › Privacy & Security',
          },
          {
            name: 'Company VPN profile is installed',
            severity: 'error',
            when: 'vpn',
            ms: 204,
            failDetail: 'No configuration profile named "Acme VPN"',
            fix: 'Install the profile from it.acme.internal/vpn',
          },
          {
            name: 'Managed Chrome is installed',
            severity: 'warn',
            when: 'chrome',
            failDetail: 'Google Chrome is not in /Applications',
            fix: 'Install Chrome from Self Service',
          },
          {
            name: 'Node 24 is installed through asdf',
            severity: 'warn',
            when: 'node',
            detail: 'node 24.11.0',
            failDetail: '.tool-versions names node 22.12.0',
            fix: 'Run asdf install nodejs 24.11.0, then asdf set --home nodejs 24.11.0',
          },
          {
            name: 'Homebrew is current',
            severity: 'recommend',
            when: 'brew',
            ms: 1012,
            failDetail: '3 formulae are outdated',
            fix: 'Run brew upgrade',
          },
        ],
      },
    ],
  },
} satisfies Record<string, KitModel>;
