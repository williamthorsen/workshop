import { runSystemctl } from '../systemctl/runSystemctl.ts';
import { buildUnitName } from './service-targets.ts';

/** Stops the service's process and starts it again, which a running service needs to load new code. */
export async function restartService(name: string): Promise<void> {
  const { exitCode, output } = await runSystemctl(['restart', buildUnitName(name)]);
  if (exitCode !== 0) {
    throw new Error(`systemctl restart failed: ${output.trim()}`);
  }
}
