import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

/** A temporary directory and the writes a suite makes against it. */
export interface TempDir {
  readonly dir: string;
  /** Creates a directory-relative directory and its parents, and returns the absolute path. */
  mkdir(relativePath: string): string;
  /** Links a directory-relative path to a directory-relative target, creating parents, and returns the link path. */
  symlinkDir(relativePath: string, relativeTarget: string): string;
  /** Writes `contents` at a directory-relative path, creating parents, and returns the absolute path. */
  write(relativePath: string, contents: string | Uint8Array): string;
  /** Writes `value` as JSON at a directory-relative path, creating parents, and returns the absolute path. */
  writeJson(relativePath: string, value: unknown): string;
}

/** How the code under test is pointed at the temporary directory. */
export type CwdMode = 'chdir' | 'mock' | 'none';

/** Options for a temporary-directory handle. */
export interface TempDirOptions {
  /** Prefix for the `mkdtemp` name, which identifies the suite among the temp directories it leaves behind. */
  prefix: string;
  /** `chdir` moves the process into the directory; `mock` makes `process.cwd()` report it. */
  cwd?: CwdMode;
  /** `file` builds one directory for the whole file; `test` builds one per test. */
  scope?: 'file' | 'test';
  /**
   * Scaffolds fixture files into the directory before the tests that use it run.
   *
   * It runs from within a hook, so it may write through the handle the suite binds this call to.
   */
  setup?: () => void;
}

/**
 * Registers a scaffolded temporary directory for the enclosing suite and returns a handle to it.
 *
 * The handle is bound once at module level and delegates to whichever directory the current scope built, so
 * a test reads the directory belonging to its own run without naming it in its signature.
 */
export function useTempDir(options: TempDirOptions): TempDir {
  const { prefix, cwd = 'none', scope = 'test', setup } = options;
  const [onSetup, onTeardown] = scope === 'file' ? [beforeAll, afterAll] : [beforeEach, afterEach];

  let current: TempDir | undefined;
  let restoreCwd = restoreNothing;

  onSetup(() => {
    current = createTempDir(prefix);
    restoreCwd = pointCwdAt(current.dir, cwd);
    setup?.();
  });

  onTeardown(() => {
    restoreCwd();
    restoreCwd = restoreNothing;
    if (current !== undefined) {
      rmSync(current.dir, { recursive: true, force: true });
      current = undefined;
    }
  });

  /** Answers with the directory the current scope built, or reports a read that arrived outside it. */
  function requireCurrent(): TempDir {
    if (current === undefined) {
      throw new Error(`The "${prefix}" temporary directory was read outside the scope that builds it.`);
    }
    return current;
  }

  return {
    get dir() {
      return requireCurrent().dir;
    },
    mkdir: (relativePath) => requireCurrent().mkdir(relativePath),
    symlinkDir: (relativePath, relativeTarget) => requireCurrent().symlinkDir(relativePath, relativeTarget),
    write: (relativePath, contents) => requireCurrent().write(relativePath, contents),
    writeJson: (relativePath, value) => requireCurrent().writeJson(relativePath, value),
  };
}

// region | Helpers

/**
 * Builds a temporary directory and the writes against it.
 *
 * The path is resolved through `realpathSync` because macOS reports `/var` for a directory the code
 * under test resolves as `/private/var`, which breaks any assertion comparing the two.
 */
function createTempDir(prefix: string): TempDir {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));

  function mkdir(relativePath: string): string {
    const absolutePath = path.join(dir, relativePath);
    mkdirSync(absolutePath, { recursive: true });
    return absolutePath;
  }

  function symlinkDir(relativePath: string, relativeTarget: string): string {
    const absolutePath = path.join(dir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    // On Windows a junction links a directory without the elevation a symlink needs; other platforms ignore the type.
    symlinkSync(path.join(dir, relativeTarget), absolutePath, 'junction');
    return absolutePath;
  }

  function write(relativePath: string, contents: string | Uint8Array): string {
    const absolutePath = path.join(dir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
    return absolutePath;
  }

  function writeJson(relativePath: string, value: unknown): string {
    return write(relativePath, JSON.stringify(value));
  }

  return { dir, mkdir, symlinkDir, write, writeJson };
}

/** Points the code under test at `dir`, returning the undo. */
function pointCwdAt(dir: string, mode: CwdMode): () => void {
  if (mode === 'chdir') {
    const originalCwd = process.cwd();
    process.chdir(dir);
    return () => process.chdir(originalCwd);
  }

  if (mode === 'mock') {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    return () => spy.mockRestore();
  }

  return restoreNothing;
}

/** Stands in as the undo for a mode that moved nothing. */
function restoreNothing(): void {}

// endregion | Helpers
