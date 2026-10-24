import { escapeSpecifiers, readStartIntervalSec, type ServiceSpec } from './renderUnit.ts';

/**
 * Renders the timer that starts a scheduled service, or returns `undefined` for a kept-alive service. `OnActiveSec=0`
 * starts the service whenever the timer starts, at install and at each boot, which makes up a run missed while the
 * machine was off: `Persistent=` covers only calendar timers.
 */
export function renderTimer(spec: ServiceSpec): string | undefined {
  const startIntervalSec = readStartIntervalSec(spec);
  if (startIntervalSec === undefined) return undefined;

  return `[Unit]
Description=${escapeSpecifiers(spec.name)}

[Timer]
AccuracySec=1s
OnActiveSec=0
OnUnitActiveSec=${startIntervalSec}s

[Install]
WantedBy=timers.target
`;
}
