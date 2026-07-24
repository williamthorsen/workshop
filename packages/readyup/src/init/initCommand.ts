import { configError } from '../errors.ts';
import { EXIT_OK } from '../exitCodes.ts';
import { printStep, reportWriteResult } from '../terminal.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { buildInstallCommand } from '../utils/install-command.ts';
import { isPackageInstalled } from '../utils/resolve-package.ts';
import { scaffoldConfig } from './scaffold.ts';

/** Steps that follow scaffolding regardless of whether readyup is already installed. */
const STANDARD_NEXT_STEPS = [
  'Customize .config/readyup.config.ts with your compile settings.',
  'Add checklists to .readyup/kits/.',
  'Compile the kits: rdy compile',
  'Run the checks: rdy run (or rdy run --jit to run straight from the TypeScript source).',
  'Commit the generated files.',
];

interface InitOptions {
  dryRun: boolean;
  force: boolean;
}

/**
 * Runs the `rdy init` command.
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
    throw configError(`Failed to scaffold config: ${extractMessage(error)}`, { cause: error });
  }

  reportWriteResult(result.configResult, dryRun);
  reportWriteResult(result.kitResult, dryRun);

  // `reportWriteResult` has already printed the per-file reason, so the thrown message stays terse.
  const failure = [result.configResult, result.kitResult].find((r) => r.outcome === 'failed');
  if (failure !== undefined) {
    throw configError(`Failed to scaffold ${failure.filePath}`);
  }

  if (!dryRun) {
    printStep('Next steps');
    console.info(`\n${buildNextSteps()}\n`);
  }

  return EXIT_OK;
}

/**
 * Compose the numbered next steps printed after scaffolding.
 *
 * The install step leads when readyup does not resolve from the project, because every later step
 * depends on it: compiling a kit resolves the kit's readyup import, and running one loads the CLI.
 * Numbering is computed so the conditional step leaves no gap.
 */
function buildNextSteps(): string {
  const steps = isPackageInstalled('readyup')
    ? STANDARD_NEXT_STEPS
    : [`Install readyup as a dev dependency: ${buildInstallCommand('readyup')}`, ...STANDARD_NEXT_STEPS];

  return steps.map((step, index) => `  ${index + 1}. ${step}`).join('\n');
}
