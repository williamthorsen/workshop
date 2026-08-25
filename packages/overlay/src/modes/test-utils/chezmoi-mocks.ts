import { vi } from 'vitest';

import * as runChezmoiModule from '../../chezmoi/run-chezmoi.ts';

/** Stubs `chezmoi status` to return the given stdout with a zero exit code. */
export function mockCapturedStatus(stdout: string): void {
  vi.spyOn(runChezmoiModule, 'runChezmoiCaptured').mockResolvedValue({ stdout, stderr: '', code: 0 });
}

/** Stubs every streamed chezmoi invocation to resolve with the given exit code. */
export function mockStreamedRun(code: number): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(runChezmoiModule, 'runChezmoiStreamed').mockResolvedValue(code);
}
