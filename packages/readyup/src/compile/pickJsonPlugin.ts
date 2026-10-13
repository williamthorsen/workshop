import type { Plugin } from 'esbuild';

import type { CompileRecorder } from './createCompileRecorder.ts';
import { inlinePickJsonCalls } from './inlinePickJsonCalls.ts';

/**
 * Returns an esbuild plugin that replaces `pickJson(...)` calls with inlined object literals.
 *
 * The plugin intercepts TypeScript file loads and substitutes each call through `inlinePickJsonCalls`.
 *
 * Every read goes through `recorder`, which puts the module and the JSON file that it projected into
 * the compile's input closure. This module imports no filesystem API of its own, so a read that it
 * performs cannot be left out of that closure.
 */
export function pickJsonPlugin(recorder: CompileRecorder): Plugin {
  return {
    name: 'pick-json',
    setup(build) {
      build.onLoad({ filter: /\.[cm]?ts$/ }, (args) => {
        let source: string;
        try {
          source = recorder.readModule(args.path);
        } catch {
          throw new Error(`pickJson: Cannot read source file "${args.path}"`);
        }

        const replaced = inlinePickJsonCalls(source, args.path, (filePath, paths) =>
          recorder.readProjection(filePath, paths),
        );

        if (replaced === source) return null;

        return { contents: replaced, loader: 'ts' };
      });
    },
  };
}
