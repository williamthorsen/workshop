import { describe, expect, it } from 'vitest';

import { renderTimer } from '../renderTimer.ts';
import type { ServiceSpec } from '../renderUnit.ts';

describe(renderTimer, () => {
  it('renders a timer that starts the service when the timer starts and then once per interval', () => {
    expect(renderTimer(buildSpec({ trigger: { startIntervalSec: 86_400 } }))).toBe(`[Unit]
Description=dev.example

[Timer]
AccuracySec=1s
OnActiveSec=0
OnUnitActiveSec=86400s

[Install]
WantedBy=timers.target
`);
  });

  it('returns undefined for a kept-alive service', () => {
    expect(renderTimer(buildSpec())).toBeUndefined();
    expect(renderTimer(buildSpec({ trigger: { keepAlive: true } }))).toBeUndefined();
  });

  it('escapes specifiers in the name', () => {
    expect(renderTimer(buildSpec({ name: 'dev%example', trigger: { startIntervalSec: 60 } }))).toContain(
      'Description=dev%%example\n',
    );
  });
});

// region | Helpers

/** Builds a minimal spec. */
function buildSpec(overrides: Partial<ServiceSpec> = {}): ServiceSpec {
  return {
    logDir: '/var/log/example',
    name: 'dev.example',
    programArguments: ['/usr/bin/node', '/srv/example/bin/run.js'],
    ...overrides,
  };
}

// endregion | Helpers
