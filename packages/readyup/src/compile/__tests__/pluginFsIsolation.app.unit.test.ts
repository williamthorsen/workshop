import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** Modules registered as esbuild plugins, which read files through a `CompileRecorder` instead of `node:fs`. */
const PLUGIN_MODULES = ['pickJsonPlugin.ts'];

/** Specifiers that reach the filesystem directly. A plugin reaching one of these can read outside the closure. */
const FILESYSTEM_SPECIFIERS = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises']);

const COMPILE_DIR = path.join(import.meta.dirname, '..');

/** A filesystem import found in a module a plugin reaches at run time. */
interface Offender {
  module: string;
  specifier: string;
}

describe('esbuild plugins are isolated from the filesystem', () => {
  it.each(PLUGIN_MODULES)('%s reaches no filesystem API', (fileName) => {
    const offenders = findFilesystemImports(path.join(COMPILE_DIR, fileName));
    const formatted = offenders.map((offender) => `  ${offender.module} imports ${offender.specifier}`).join('\n');

    expect(offenders, `Found filesystem imports reachable from the plugin:\n${formatted}`).toStrictEqual([]);
  });

  // The walk has to reach past the entry, or a plugin could regain a filesystem API through any import.
  it('reports a filesystem import reached through another module', () => {
    const offenders = findFilesystemImports(path.join(COMPILE_DIR, 'createCompileRecorder.ts'));

    expect(offenders).toContainEqual({ module: 'projectJsonFile.ts', specifier: 'node:fs' });
  });
});

// region | Helpers

/** Walks a module's value imports transitively and returns every filesystem import reachable from it. */
function findFilesystemImports(entryPath: string): Offender[] {
  const offenders: Offender[] = [];
  const visited = new Set<string>();
  const queue = [entryPath];

  while (queue.length > 0) {
    const modulePath = queue.pop();
    if (modulePath === undefined || visited.has(modulePath)) continue;
    visited.add(modulePath);

    for (const specifier of readValueImports(modulePath)) {
      if (FILESYSTEM_SPECIFIERS.has(specifier)) {
        offenders.push({ module: path.relative(COMPILE_DIR, modulePath), specifier });
      } else if (specifier.startsWith('.')) {
        queue.push(path.resolve(path.dirname(modulePath), specifier));
      }
    }
  }

  return offenders.toSorted((a, b) => a.module.localeCompare(b.module) || a.specifier.localeCompare(b.specifier));
}

/**
 * Returns the specifiers a module imports for their values, in source order.
 *
 * Type-only imports are left out because they are erased: a type reaching a module that reads files says
 * nothing about what the importer can do at run time.
 */
function readValueImports(modulePath: string): string[] {
  const text = readFileSync(modulePath, 'utf8');
  const source = ts.createSourceFile(modulePath, text, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!importsValues(statement.importClause)) continue;
      if (ts.isStringLiteral(statement.moduleSpecifier)) specifiers.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) {
      if (statement.isTypeOnly) continue;
      if (ts.isStringLiteral(statement.moduleSpecifier)) specifiers.push(statement.moduleSpecifier.text);
    }
  }

  return specifiers;
}

/** Reports whether an import clause binds anything that survives to run time. */
function importsValues(importClause: ts.ImportClause | undefined): boolean {
  // A bare `import './x.ts'` has no clause and is evaluated for its side effects alone.
  if (importClause === undefined) return true;
  if (importClause.phaseModifier === ts.SyntaxKind.TypeKeyword) return false;
  if (importClause.name !== undefined) return true;

  const bindings = importClause.namedBindings;
  if (bindings === undefined) return false;
  if (ts.isNamespaceImport(bindings)) return true;

  return bindings.elements.some((element) => !element.isTypeOnly);
}

// endregion | Helpers
