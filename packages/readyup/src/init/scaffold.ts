import type { WriteResult } from '../writeFileWithCheck.ts';
import { writeFileWithCheck } from '../writeFileWithCheck.ts';
import { rdyConfigTemplate, rdyKitTemplate } from './templates.ts';

const CONFIG_PATH = '.config/rdy.config.ts';
const KIT_PATH = '.rdy/kits/default.ts';

interface ScaffoldOptions {
  dryRun: boolean;
  force: boolean;
}

interface ScaffoldResult {
  configResult: WriteResult;
  kitResult: WriteResult;
}

/** Scaffold the rdy config and starter kit files. */
export function scaffoldConfig({ dryRun, force }: ScaffoldOptions): ScaffoldResult {
  const configResult = writeFileWithCheck(CONFIG_PATH, rdyConfigTemplate, { dryRun, overwrite: force });
  const kitResult = writeFileWithCheck(KIT_PATH, rdyKitTemplate, {
    dryRun,
    overwrite: force,
  });
  return { configResult, kitResult };
}
