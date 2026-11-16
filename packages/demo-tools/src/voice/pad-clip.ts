import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Returns an MP3 clip with `silenceMs` of silence appended, re-encoded by ffmpeg at the clip's own sample rate. Rejects
 * when ffmpeg cannot run or cannot read the clip.
 */
export async function padClip(audio: Buffer, silenceMs: number): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thor-demo-pad-'));
  try {
    const input = path.join(dir, 'clip.mp3');
    const output = path.join(dir, 'padded.mp3');
    await writeFile(input, audio);
    // Keep the output path last, where the tool tests' fake ffmpeg writes its copy of the input.
    await execFileAsync('ffmpeg', [
      '-nostdin',
      '-hide_banner',
      '-y',
      '-i',
      input,
      '-af',
      `apad=pad_dur=${silenceMs / 1000}`,
      '-c:a',
      'libmp3lame',
      '-q:a',
      '2',
      output,
    ]);
    return await readFile(output);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}
