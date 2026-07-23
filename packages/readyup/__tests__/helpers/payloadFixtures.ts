/**
 * Representative payloads for each published JSON contract.
 *
 * Shared by the zod-schema suite and the generated-JSON-Schema suite so both judge the same
 * documents: a payload the zod schema accepts but the published schema rejects is exactly the
 * divergence the generation step could introduce.
 */

/**
 * A report exercising every optional field, three levels of nesting, and both kit-entry shapes.
 *
 * The kit's effective `failOn` differs from the requested one, which is the case the split exists
 * for: a kit declaring its own threshold cannot be described by the run-level value.
 */
export const reportPayload = {
  schemaVersion: 1,
  readyupVersion: '0.21.2',
  passed: false,
  counts: { passed: 2, errors: 1, warnings: 0, recommendations: 0, blocked: 1, optional: 0 },
  worstSeverity: 'error',
  failOn: 'error',
  reportOn: 'recommend',
  detail: 'full',
  durationMs: 42,
  warnings: [{ code: 'version-skew', message: 'kit is stale', remedy: 'Run `rdy compile` to refresh.' }],
  kits: [
    {
      name: 'deploy',
      passed: false,
      counts: { passed: 2, errors: 1, warnings: 0, recommendations: 0, blocked: 1, optional: 0 },
      worstSeverity: 'error',
      failOn: 'warn',
      reportOn: 'recommend',
      durationMs: 42,
      checklists: [
        {
          name: 'preflight',
          passed: false,
          counts: { passed: 2, errors: 1, warnings: 0, recommendations: 0, blocked: 1, optional: 0 },
          worstSeverity: 'error',
          durationMs: 42,
          checks: [
            {
              name: 'gate',
              status: 'passed',
              ok: true,
              severity: 'error',
              durationMs: 3,
              progress: { type: 'fraction', passedCount: 3, count: 5 },
              checks: [
                {
                  name: 'child',
                  status: 'failed',
                  ok: false,
                  severity: 'error',
                  durationMs: 1,
                  detail: 'missing dependency',
                  fix: 'run install',
                  error: 'ENOENT',
                  checks: [{ name: 'grandchild', status: 'skipped', ok: null, severity: 'error', durationMs: 0 }],
                },
              ],
            },
            { name: 'optional', status: 'skipped', ok: null, severity: 'warn', durationMs: 0, skipReason: 'n/a' },
          ],
        },
      ],
    },
    { name: 'release', error: { code: 'kit-load', message: 'Cannot find release.js' } },
  ],
};

/**
 * The smallest report the schema accepts: every optional field absent.
 *
 * The thresholds are among them, since a bare invocation requests neither.
 */
export const minimalReportPayload = {
  schemaVersion: 1,
  readyupVersion: '0.21.2',
  passed: true,
  counts: { passed: 0, errors: 0, warnings: 0, recommendations: 0, blocked: 0, optional: 0 },
  detail: 'summary',
  durationMs: 0,
  kits: [],
};

/**
 * A report carrying an advisory this readyup does not know about.
 *
 * Stands in for a payload from a later version: the open warning-code set is what keeps a consumer
 * pinned to `report.v1.json` validating it rather than rejecting it.
 */
export const unknownWarningReportPayload = {
  ...minimalReportPayload,
  warnings: [{ code: 'kit-deprecated', message: 'kit uses a retired API', remedy: 'Regenerate the kit.' }],
};

export const errorEnvelopePayload = {
  schemaVersion: 1,
  error: { code: 'usage', message: "Unknown option '--bogus'" },
};

export const listPayload = {
  schemaVersion: 1,
  kits: [
    { name: 'deploy', kind: 'compiled', path: 'deploy.js', readyupVersion: '0.21.2', checklists: ['preflight'] },
    { name: 'draft', kind: 'internal' },
  ],
};

export const verifyPayload = {
  schemaVersion: 1,
  passed: false,
  kits: [
    { name: 'deploy', status: 'ok' },
    { name: 'release', status: 'drift', expected: 'abc123', actual: 'def456' },
  ],
};

export const compilePayload = {
  schemaVersion: 1,
  passed: false,
  kits: [
    { name: 'deploy', status: 'compiled' },
    { name: 'release', status: 'failed', error: 'Kit must export a default RdyKit' },
  ],
};
