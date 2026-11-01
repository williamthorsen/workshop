import path from 'node:path';

import type { ServerProcess } from '../voice-server.ts';
import { buildHuggingFaceEnv, formatVenvPython } from './plan-install.ts';

/** The only address on which the server listens. */
export const SERVER_HOST = '127.0.0.1';

/**
 * Returns the mlx-audio speech server for the install under `home`, listening on `port` on loopback alone, with
 * Hugging Face's offline mode on so that it never fetches a model.
 */
export function buildServerLaunch(home: string, port: number): ServerProcess {
  const baseUrl = `http://${SERVER_HOST}:${port}`;
  const logsDir = path.join(home, 'logs');

  return {
    command: formatVenvPython(home),
    args: [
      '-m',
      'mlx_audio.server',
      '--host',
      SERVER_HOST,
      '--port',
      String(port),
      '--log-dir',
      logsDir,
      // Narrow the server's default of every origin, so that a web page cannot call it.
      '--allowed-origins',
      baseUrl,
    ],
    baseUrl,
    env: { ...buildHuggingFaceEnv(home), HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
    logPath: path.join(logsDir, 'server.log'),
  };
}
