import { describeError } from '@williamthorsen/toolbelt.errors';

import { EXIT_OK } from '../bin/exitCodes.ts';
import { configError } from '../errors/RdyError.ts';
import { isPackageInstalled } from '../installed-packages/isPackageInstalled.ts';
import { printStep, reportWriteResult } from '../output/terminal.ts';
import { buildInstallCommand } from '../portable/buildInstallCommand.ts';
import { scaffoldConfig } from './scaffold.ts';

/** Packages that the next steps need from the project, in the order in which the install step names them. */
const PREREQUISITE_PACKAGES = ['readyup', 'esbuild'];

/** Steps that follow scaffolding regardless of whether readyup is already installed. */
const STANDARD_NEXT_STEPS = [
  'Customize .config/readyup.config.ts with the compile settings for this project.',
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
    throw configError(`Failed to scaffold config: ${describeError(error)}`, { cause: error });
  }

  reportWriteResult(result.configResult, dryRun);
  reportWriteResult(result.kitResult, dryRun);

  // Keep the thrown message terse, because `reportWriteResult` has already printed the per-file reason.
  const failure = [result.configResult, result.kitResult].find((r) => r.outcome === 'failed');
  if (failure !== undefined) {
    throw configError(`Failed to scaffold ${failure.filePath}`);
  }

  if (!dryRun) {
    printStep('Next steps');
    console.info(`${buildNextSteps()}\n`);
  }

  return EXIT_OK;
}

/**
 * Returns the numbered next steps printed after scaffolding.
 *
 * The install step leads when readyup or esbuild does not resolve from the project, because every later step
 * depends on them: compiling a kit takes esbuild and resolves the kit's readyup import, and running one loads the
 * CLI. One command installs every missing package. Numbering is computed so that the conditional step leaves no gap.
 */
function buildNextSteps(): string {
  const missing = PREREQUISITE_PACKAGES.filter((packageName) => !isPackageInstalled(packageName));
  const steps = missing.length === 0 ? STANDARD_NEXT_STEPS : [describeInstallStep(missing), ...STANDARD_NEXT_STEPS];

  return steps.map((step, index) => `  ${index + 1}. ${step}`).join('\n');
}

// region | Helpers

/** Returns the step that installs the missing packages, naming why esbuild is among them. */
function describeInstallStep(missing: string[]): string {
  const noun = missing.length === 1 ? 'a dev dependency' : 'dev dependencies';
  const reason = missing.includes('esbuild') ? ' (rdy compile needs esbuild)' : '';
  return `Install ${missing.join(' and ')} as ${noun}${reason}: ${buildInstallCommand(...missing)}`;
}

// endregion | Helpers
