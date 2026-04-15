import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { build, type Format, type Platform, type Plugin } from 'esbuild';
import { glob } from 'glob';

const CACHE_FILE = 'dist/esm/.cache';
const format: Format = 'esm';
const packageDir = path.basename(process.cwd());
const platform: Platform = 'node';
const target = 'es2022';

const PACKAGE_ICON = '📦';
const SKIPPED_ICON = '🔍';

const aliases = {
  '~/src/': 'src/',
};
const dependencies = ['package.json'];
const entryPoints = await glob(['src/**/*.ts'], {
  ignore: ['**/__tests__/**'],
});
const outputConfig = { format, platform, target: [target] };

if (await hashChanged()) {
  await build({
    entryPoints,
    outdir: 'dist/esm/',
    bundle: false,
    sourcemap: false,
    plugins: [rewriteTsExtensions()],
    ...outputConfig,
  });
}

// region | Helper functions
async function hashChanged(): Promise<boolean> {
  const previousHash = existsSync(CACHE_FILE) ? readFileSync(CACHE_FILE, 'utf8') : undefined;
  const currentHash = await computeHash();

  if (previousHash === currentHash) {
    console.info(`${SKIPPED_ICON} ${packageDir}: No changes detected. Skipping build.`);
    return false;
  }

  console.info(`${PACKAGE_ICON} ${packageDir}: Changes detected.`);
  await mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, currentHash);
  return true;
}

async function computeHash(): Promise<string> {
  const hash = createHash('sha256');
  for (const file of [...entryPoints, ...dependencies]) {
    const content = await readFile(file);
    hash.update(content);
  }

  hash.update(JSON.stringify(outputConfig));
  return hash.digest('hex');
}

function rewriteTsExtensions(): Plugin {
  return {
    name: 'rewrite-ts-extensions',
    setup(build) {
      build.onLoad({ filter: /\.ts$/ }, async (args) => {
        const fileDir = path.dirname(args.path);
        let code = await readFile(args.path, 'utf8');

        // Detect and strip shebang before transforms, then reattach it afterward
        let shebang = '';
        if (code.startsWith('#!')) {
          const newlineIndex = code.indexOf('\n');
          if (newlineIndex === -1) {
            return { contents: code, loader: 'ts' };
          }
          shebang = code.slice(0, newlineIndex + 1);
          code = code.slice(newlineIndex + 1);
        }

        code = resolveAliasImports(code, fileDir, aliases);
        code = rewriteTsImportExtensions(code);

        return { contents: `${shebang}${code}`, loader: 'ts' };
      });
    },
  };
}

/**
 * Rewrites alias import paths to relative filesystem paths from the importing file.
 *
 * @param code - The TypeScript source code.
 * @param fileDir - The absolute path to the importing file’s directory.
 * @param aliasMap - A map of alias prefixes (e.g. '@/') to base paths (e.g. 'src/').
 */
function resolveAliasImports(code: string, fileDir: string, aliasMap: Record<string, string>): string {
  for (const [alias, targetDir] of Object.entries(aliasMap)) {
    const escaped = alias.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`); // escape regex
    const regex = new RegExp(String.raw`(?<=from\s+['"])${escaped}([^'"]+)(?=['"])`, 'g');

    code = code.replace(regex, (_, subpath: string) => {
      const absolute = path.resolve(targetDir, subpath);
      const relative = path.relative(fileDir, absolute);
      return relative.startsWith('.') ? relative : `./${relative}`;
    });
  }

  return code;
}

/**
 * Rewrites relative imports ending in `.ts` to `.js` to match compiled output.
 */
function rewriteTsImportExtensions(code: string): string {
  return code.replaceAll(/(?<=from\s+['"])(\.{1,2}\/[^'"]+)\.ts(?=['"])/g, '$1.js');
}
// endregion | Helper functions
