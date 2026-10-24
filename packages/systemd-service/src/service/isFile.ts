import { access } from 'node:fs/promises';

/** Reports whether a file exists at the path. */
export async function isFile(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
