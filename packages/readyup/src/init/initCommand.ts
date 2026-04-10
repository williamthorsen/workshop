import { printError, printStep, reportWriteResult } from '../terminal.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { scaffoldConfig } from './scaffold.ts';

interface InitOptions {
  dryRun: boolean;
  force: boolean;
}

/**
 * Run the `rdy init` command.
 *
 * Scaffolds a starter config file and kit file, then prints next steps.
 * Returns the process exit code (0 for success, 1 for failure).
 */
export function initCommand({ dryRun, force }: InitOptions): number {
  if (dryRun) {
    console.info('[dry-run mode]');
  }

  printStep('Scaffolding config');
  let result: ReturnType<typeof scaffoldConfig>;
  try {
    result = scaffoldConfig({ dryRun, force });
  } catch (error: unknown) {
    printError(`Failed to scaffold config: ${extractMessage(error)}`);
    return 1;
  }

  reportWriteResult(result.configResult, dryRun);
  reportWriteResult(result.kitResult, dryRun);

  if (result.configResult.outcome === 'failed' || result.kitResult.outcome === 'failed') {
    return 1;
  }

  if (!dryRun) {
    printStep('Next steps');
    console.info(`
  1. Customize .config/rdy.config.ts with your compile settings.
  2. Add checklists to .rdy/kits/.
  3. Test by running: npx readyup run
  4. Commit the generated files.
`);
  }

  return 0;
}
