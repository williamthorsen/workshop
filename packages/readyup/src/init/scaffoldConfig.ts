import { writeFileWithCheck, type WriteResult } from '../portable/writeFileWithCheck.ts';
import { rdyConfigTemplate, rdyKitTemplate } from './templates.ts';

const CONFIG_PATH = '.config/readyup.config.ts';
const KIT_PATH = '.readyup/kits/default.ts';

interface ScaffoldOptions {
  isDryRun: boolean;
  shouldForce: boolean;
}

interface ScaffoldResult {
  configResult: WriteResult;
  kitResult: WriteResult;
}

/** Scaffolds the rdy config and starter kit files. */
export function scaffoldConfig({ isDryRun, shouldForce }: ScaffoldOptions): ScaffoldResult {
  const configResult = writeFileWithCheck(CONFIG_PATH, rdyConfigTemplate, { isDryRun, shouldOverwrite: shouldForce });
  const kitResult = writeFileWithCheck(KIT_PATH, rdyKitTemplate, {
    isDryRun,
    shouldOverwrite: shouldForce,
  });
  return { configResult, kitResult };
}
