import { describe, expect, it } from 'vitest';

import { EXIT_OK, EXIT_PROBLEMS_FOUND, EXIT_TOOL_FAILURE } from '../../bin/exitCodes.ts';
import { resolveRunExitCode } from '../resolveRunExitCode.ts';

describe(resolveRunExitCode, () => {
  it('reports a tool failure when a kit never ran', () => {
    expect(resolveRunExitCode(true, true)).toBe(EXIT_TOOL_FAILURE);
  });

  it('ranks a kit that never ran above checks that failed', () => {
    expect(resolveRunExitCode(true, false)).toBe(EXIT_TOOL_FAILURE);
  });

  it('reports problems found when every kit ran and a check failed', () => {
    expect(resolveRunExitCode(false, false)).toBe(EXIT_PROBLEMS_FOUND);
  });

  it('reports success when every kit ran and every check passed', () => {
    expect(resolveRunExitCode(false, true)).toBe(EXIT_OK);
  });
});
