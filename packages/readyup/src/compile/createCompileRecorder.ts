import { readFileSync } from 'node:fs';
import path from 'node:path';

import { hashBytes, hashProjection } from '../verify/targetHash.ts';
import type { CompiledInput } from './CompiledInput.ts';
import { identifyInput } from './CompiledInput.ts';
import type { JsonPathSpec } from './extractJsonPaths.ts';
import { projectJsonFile } from './projectJsonFile.ts';

/**
 * The two doors a compile plugin reads files through.
 *
 * Both record, so a file a plugin reads out of band cannot escape the compile's input closure. A plugin
 * holds a recorder rather than importing `node:fs`, which is what keeps that property true of the next
 * plugin as well as this one.
 */
export interface CompileRecorder {
  /** Every file read so far, one record per path and kind, in the order the reads happened. */
  readonly inputs: CompiledInput[];

  /** Reads a module and records its contents. */
  readModule(filePath: string): string;

  /**
   * Reads a JSON file and records the projection of `paths` over it, returning that projection serialized.
   *
   * Recording the projection rather than the file is what keeps an edit to a field the kit did not pick
   * from reading as staleness.
   */
  readProjection(filePath: string, paths: JsonPathSpec): string;
}

/** Builds a recorder that accumulates the closure of everything read through it. */
export function createCompileRecorder(): CompileRecorder {
  const recorded = new Map<string, CompiledInput>();

  return {
    get inputs(): CompiledInput[] {
      return recorded.values().toArray();
    },

    readModule(filePath: string): string {
      const resolvedPath = path.resolve(filePath);
      const bytes = readFileSync(resolvedPath);
      record(recorded, { hash: hashBytes(bytes), kind: 'module', path: resolvedPath });
      return bytes.toString('utf8');
    },

    readProjection(filePath: string, paths: JsonPathSpec): string {
      const resolvedPath = path.resolve(filePath);
      const projection = projectJsonFile(resolvedPath, paths);
      record(recorded, { hash: hashProjection(projection), kind: 'inline', path: resolvedPath, paths });
      return projection;
    },
  };
}

// region | Helpers

/** Records an input, leaving a repeat read of the same path and kind with the record it already has. */
function record(recorded: Map<string, CompiledInput>, input: CompiledInput): void {
  const key = identifyInput(input.kind, input.path);
  if (!recorded.has(key)) recorded.set(key, input);
}

// endregion | Helpers
