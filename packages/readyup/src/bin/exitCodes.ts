/**
 * Process exit codes, following the grep/ripgrep/eslint convention.
 *
 * The code answers "can I retry this invocation?": 1 means the invocation was well-formed
 * and the repo has problems to fix; 2 means rdy could not complete the invocation at all.
 * `rdy list` and `rdy init` produce only 0 and 2 — neither can find problems to report.
 */

/** Ran to completion and found no problems. */
export const EXIT_OK = 0;

/** Ran to completion and found problems with the repo or its kits. */
export const EXIT_PROBLEMS_FOUND = 1;

/** Could not complete the invocation: a usage, config, kit-load, or internal error. */
export const EXIT_TOOL_FAILURE = 2;
