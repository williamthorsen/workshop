import { type Mock, vi } from 'vitest';

import type { Git } from '../run-git.ts';

/** What a faked git command answers: its stdout, its failure, or a function of its stdin and arguments. */
export type FakeGitAnswer = string | Error | ((input: string, args: readonly string[]) => string | Error);

/** A `Git` whose runners are mocks, so that a test can assert the commands that the code ran. */
export type FakeGit = { [K in keyof Git]: Mock<Git[K]> };

/**
 * Returns a fake `Git` that answers each command from the first route whose key the space-joined arguments contain.
 *
 * A command that matches no route rejects with a plain error, which no caller mistakes for a missing ref.
 */
export function createFakeGit(routes: Record<string, FakeGitAnswer> = {}): FakeGit {
  function answer(args: readonly string[], input: string): Promise<string> {
    const command = args.join(' ');
    for (const [pattern, value] of Object.entries(routes)) {
      if (!command.includes(pattern)) continue;
      const result = typeof value === 'function' ? value(input, args) : value;
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    }
    return Promise.reject(new Error(`Unexpected git call: git ${command}`));
  }

  return {
    runGit: vi.fn<Git['runGit']>((_path, ...args) => answer(args, '')),
    runGitRaw: vi.fn<Git['runGitRaw']>((_path, ...args) => answer(args, '')),
    runGitWithInput: vi.fn<Git['runGitWithInput']>((_path, input, ...args) => answer(args, input)),
  };
}

/** Builds the error shape produced by git for a ref that does not resolve. */
export function makeRefMissingError(ref: string): Error {
  return Object.assign(new Error(`unknown revision: ${ref}`), {
    code: 128,
    stderr: `fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.`,
  });
}
