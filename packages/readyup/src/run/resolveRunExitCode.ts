import { EXIT_OK, EXIT_PROBLEMS_FOUND, EXIT_TOOL_FAILURE } from '../bin/exitCodes.ts';

/**
 * Reduces a run's outcomes to one exit code, worst first.
 *
 * A kit that never ran outranks failed checks: part of the invocation was not completed, so
 * reporting "ran, found problems" would be false.
 */
export function resolveRunExitCode(anyKitFailed: boolean, allPassed: boolean): number {
  if (anyKitFailed) return EXIT_TOOL_FAILURE;
  return allPassed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}
