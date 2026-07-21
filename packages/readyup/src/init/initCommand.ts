import { internalError } from '../errors.ts';
import { EXIT_OK } from '../exitCodes.ts';
import { printStep, reportWriteResult } from '../terminal.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { scaffoldConfig } from './scaffold.ts';

interface InitOptions {
  dryRun: boolean;
  force: boolean;
}

/**
 * Run the `rdy init` command.
 *
 * Scaffolds a starter config file and kit file, then prints next steps. Scaffolding is
 * either completed or not attempted, so the only outcomes are success and a thrown failure.
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
    throw internalError(`Failed to scaffold config: ${extractMessage(error)}`, { cause: error });
  }

  reportWriteResult(result.configResult, dryRun);
  reportWriteResult(result.kitResult, dryRun);

  // `reportWriteResult` has already printed the per-file reason, so the thrown message stays terse.
  const failure = [result.configResult, result.kitResult].find((r) => r.outcome === 'failed');
  if (failure !== undefined) {
    throw internalError(`Failed to scaffold ${failure.filePath}`);
  }

  if (!dryRun) {
    printStep('Next steps');
    console.info(`
  1. Customize .config/readyup.config.ts with your compile settings.
  2. Add checklists to .readyup/kits/.
  3. Test by running: npx readyup run
  4. Commit the generated files.
`);
  }

  return EXIT_OK;
}
