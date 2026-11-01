import { readFileSync } from 'node:fs';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { findFreePort } from '../../portable/find-free-port.ts';
import { startVoiceServer, type StartVoiceServerResult, type VoiceServer } from '../voice-server.ts';

// Each fake writes its pid to the file named by its second argument, then behaves as its name says.
const FAKES = {
  'exits.mjs': `import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[3], String(process.pid));
console.error('fake server failed');
process.exit(3);
`,
  'listens.mjs': `import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[3], String(process.pid));
createServer((_request, response) => response.end('ok')).listen(Number(process.argv[2]), '127.0.0.1');
`,
  'never-listens.mjs': `import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[3], String(process.pid));
setInterval(() => {}, 1000);
`,
  'ignores-sigterm.mjs': `import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[3], String(process.pid));
process.on('SIGTERM', () => {});
createServer((_request, response) => response.end('ok')).listen(Number(process.argv[2]), '127.0.0.1');
`,
};

describe(startVoiceServer, () => {
  it('resolves once the server answers, and stops it', async () => {
    using tree = createTempTree(FAKES);
    const launch = await buildFake(tree, 'listens.mjs');

    const result = await startVoiceServer(launch);

    if (!result.ok) throw new Error(result.message);
    await expect((await fetch(result.server.baseUrl)).text()).resolves.toBe('ok');
    await result.server.stop();
    expect(isRunning(readPid(tree))).toBe(false);
  });

  it('reports a server that exits before it is ready, naming its log', async () => {
    using tree = createTempTree(FAKES);
    const launch = await buildFake(tree, 'exits.mjs');

    const result = await startVoiceServer(launch);

    expect(result).toStrictEqual({
      ok: false,
      message: `the voice-clone server exited with code 3 before it was ready; see ${launch.logPath}`,
    });
    expect(readFileSync(launch.logPath, 'utf8')).toContain('fake server failed');
  });

  it('stops and reports a server that does not answer within the timeout', async () => {
    using tree = createTempTree(FAKES);
    const launch = await buildFake(tree, 'never-listens.mjs');

    const result = await startVoiceServer(launch, { readyTimeoutMs: 500 });

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('did not answer') });
    expect(isRunning(readPid(tree))).toBe(false);
  });

  it('kills a server that ignores SIGTERM once the grace period ends', async () => {
    using tree = createTempTree(FAKES);
    const launch = await buildFake(tree, 'ignores-sigterm.mjs');

    const server = readServer(await startVoiceServer(launch, { stopGraceMs: 200 }));

    await server.stop();
    expect(isRunning(readPid(tree))).toBe(false);
  });
});

// region | Helpers

/** Returns the launch of a fake server from `tree`, on a free port, with its log in `tree`. */
async function buildFake(tree: TempTree, script: string) {
  const port = await findFreePort('127.0.0.1');
  return {
    command: process.execPath,
    args: [tree.resolve(script), String(port), tree.resolve('pid')],
    baseUrl: `http://127.0.0.1:${port}`,
    env: {},
    logPath: tree.resolve('logs/server.log'),
  };
}

/** Reports whether a process with `pid` exists. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Reads the pid that the fake recorded. */
function readPid(tree: TempTree): number {
  return Number(readFileSync(tree.resolve('pid'), 'utf8'));
}

/** Returns the started server, failing the test with the reason when it did not start. */
function readServer(result: StartVoiceServerResult): VoiceServer {
  if (!result.ok) throw new Error(result.message);
  return result.server;
}

// endregion | Helpers
