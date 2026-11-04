import type { KitModel } from './kitModel.ts';

/** The migration kit that `@acme/http-client` publishes, whose findings checks name each site that v3 breaks. */
export const MIGRATION_KIT: KitModel = {
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
};
