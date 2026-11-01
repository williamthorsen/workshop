import { existsSync } from 'node:fs';
import path from 'node:path';

/** Reports whether aidemo has recorded the demo: a raw take, from either capture path, and its timeline. */
export function isDemoRecorded(demoDir: string): boolean {
  const hasTake = ['raw.webm', 'raw.mp4'].some((name) => existsSync(path.join(demoDir, 'recordings', name)));

  return hasTake && existsSync(path.join(demoDir, 'generated', 'timeline.json'));
}
