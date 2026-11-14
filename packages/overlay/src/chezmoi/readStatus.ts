import { OverlayError } from '../errors/OverlayError.ts';
import type { ChezmoiContext } from './run-chezmoi.ts';

/**
 * Reads `chezmoi status`, treating a non-zero exit as a hard error.
 *
 * A non-zero `status` exit (missing source dir, rejected flag, config issue) yields empty stdout, which `parseStatus`
 * would read as "no drift", silently masking the failure as a converged target; the failure therefore throws an
 * `OverlayError`.
 */
export async function readStatus(context: ChezmoiContext): Promise<string> {
  const { stdout, stderr, code } = await context.runner.runCaptured(context, ['status']);
  if (code !== 0) {
    const detail = stderr.trim() === '' ? `exit code ${code}` : stderr.trim();
    throw new OverlayError(`chezmoi status failed: ${detail}`);
  }
  return stdout;
}
