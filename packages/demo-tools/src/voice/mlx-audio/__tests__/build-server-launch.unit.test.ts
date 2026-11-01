import { describe, expect, it } from 'vitest';

import { buildServerLaunch } from '../build-server-launch.ts';

describe(buildServerLaunch, () => {
  const launch = buildServerLaunch('/voice', 4_321);

  it("runs mlx-audio's server from the virtual environment, bound to 127.0.0.1 on the given port", () => {
    expect(launch.command).toBe('/voice/venv/bin/python');
    expect(launch.args.slice(0, 6)).toStrictEqual(['-m', 'mlx_audio.server', '--host', '127.0.0.1', '--port', '4321']);
    expect(launch.baseUrl).toBe('http://127.0.0.1:4321');
  });

  it("turns on Hugging Face's offline mode and keeps its caches under the install location", () => {
    expect(launch.env).toStrictEqual({ HF_HOME: '/voice/hf', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' });
  });

  it('keeps the logs under the install location and allows only its own origin', () => {
    expect(launch.args).toContain('/voice/logs');
    expect(launch.args.slice(-2)).toStrictEqual(['--allowed-origins', 'http://127.0.0.1:4321']);
    expect(launch.logPath).toBe('/voice/logs/server.log');
  });
});
