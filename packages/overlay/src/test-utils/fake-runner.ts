import { type Mock, vi } from 'vitest';

import type { CapturedResult, ChezmoiContext, ChezmoiDirs } from '../chezmoi/run-chezmoi.ts';

/** Context whose runner methods are mocks that a test can program and inspect. */
export interface FakeChezmoiContext extends ChezmoiContext {
  runner: {
    runCaptured: Mock<(dirs: ChezmoiDirs, args: string[]) => Promise<CapturedResult>>;
    runStreamed: Mock<(dirs: ChezmoiDirs, args: string[]) => Promise<number>>;
  };
}

/** Options that program the fake runner's responses. */
export interface FakeRunnerOptions {
  captured?: Partial<CapturedResult>;
  streamedCode?: number;
}

/**
 * Builds a context with a fake runner. Every captured run resolves with `captured` over a zero-exit, empty result, and
 * every streamed run resolves with `streamedCode`, which defaults to `0`.
 */
export function createFakeContext(options: FakeRunnerOptions = {}): FakeChezmoiContext {
  const captured: CapturedResult = { stdout: '', stderr: '', code: 0, ...options.captured };
  return {
    source: '/src',
    target: '/target',
    runner: {
      runCaptured: vi.fn<(dirs: ChezmoiDirs, args: string[]) => Promise<CapturedResult>>().mockResolvedValue(captured),
      runStreamed: vi
        .fn<(dirs: ChezmoiDirs, args: string[]) => Promise<number>>()
        .mockResolvedValue(options.streamedCode ?? 0),
    },
  };
}
