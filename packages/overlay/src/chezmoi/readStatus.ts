import type { ChezmoiContext } from './runChezmoi.ts';
import { runChezmoiCaptured } from './runChezmoi.ts';

/**
 * Read `chezmoi status`, treating a non-zero exit as a hard error.
 *
 * A non-zero `status` exit (missing source dir, rejected flag, config issue) yields empty stdout, which `parseStatus`
 * would read as "no drift" — silently masking the failure as a converged target. Throwing here propagates to the
 * top-level handler, which maps it to exit `2`.
 */
export async function readStatus(context: ChezmoiContext): Promise<string> {
  const { stdout, stderr, code } = await runChezmoiCaptured(context, ['status']);
  if (code !== 0) {
    const detail = stderr.trim() === '' ? `exit code ${code}` : stderr.trim();
    throw new Error(`chezmoi status failed: ${detail}`);
  }
  return stdout;
}
