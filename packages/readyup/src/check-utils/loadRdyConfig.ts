import process from 'node:process';

import { loadConfig } from '../config/loadConfig.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';

/**
 * Reads the readyup config of a project, with every key that it leaves out filled by its default.
 *
 * Reads `.config/readyup.config.ts` under `fromDir`, and returns the defaults when that file does not exist. A run's
 * `--config` flag does not reach this function. A config file that cannot be evaluated throws.
 */
export async function loadRdyConfig(fromDir: string = process.cwd()): Promise<ResolvedRdyConfig> {
  return await loadConfig({ fromDir });
}
