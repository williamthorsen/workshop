import type { WriteResult } from './writeFileWithCheck.ts';

/** Print a step label with a right-arrow prefix. */
export function printStep(message: string): void {
  console.info(`\n> ${message}`);
}

/** Print a success message with a checkmark emoji prefix. */
export function printSuccess(message: string): void {
  console.info(`  ✅ ${message}`);
}

/** Print a skip/warning message to stdout. */
export function printSkip(message: string): void {
  console.info(`  ⚠️ ${message}`);
}

/** Print an error message to stderr. */
export function printError(message: string): void {
  console.error(`  ❌ ${message}`);
}

/** Print a terminal message for a write result based on its outcome. */
export function reportWriteResult(result: WriteResult, dryRun: boolean): void {
  switch (result.outcome) {
    case 'created':
      if (dryRun) {
        printSuccess(`[dry-run] Would create ${result.filePath}`);
      } else {
        printSuccess(`Created ${result.filePath}`);
      }
      break;
    case 'overwritten':
      if (dryRun) {
        printSuccess(`[dry-run] Would overwrite ${result.filePath}`);
      } else {
        printSuccess(`Overwrote ${result.filePath}`);
      }
      break;
    case 'up-to-date':
      printSuccess(`${result.filePath} (up to date)`);
      break;
    case 'skipped':
      if (result.error) {
        printSkip(`${result.filePath} (could not read for comparison: ${result.error})`);
      } else {
        printSkip(`${result.filePath} (already exists)`);
      }
      break;
    case 'failed':
      if (result.error) {
        printError(`Failed to write ${result.filePath}: ${result.error}`);
      } else {
        printError(`Failed to write ${result.filePath}`);
      }
      break;
  }
}
