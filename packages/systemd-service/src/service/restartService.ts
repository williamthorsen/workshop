import { runSystemctl } from '../systemctl/runSystemctl.ts';
import { buildUnitName } from './service-targets.ts';

/**
 * Stops the service's process and starts it again, which a running service needs to load new code. A scheduled service
 * runs now, and the call resolves when the run ends. Rejects when systemctl refuses, which includes a scheduled run that
 * fails.
 */
export async function restartService(name: string): Promise<void> {
  const { exitCode, output } = await runSystemctl(['restart', buildUnitName(name)]);
  if (exitCode !== 0) {
    throw new Error(`systemctl restart failed: ${output.trim()}`);
  }
}
