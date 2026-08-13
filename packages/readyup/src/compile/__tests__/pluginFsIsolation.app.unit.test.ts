import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** Specifiers that reach the filesystem directly. A plugin reaching one of these can read outside the closure. */
const FILESYSTEM_SPECIFIERS = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises']);

const COMPILE_DIR = path.join(import.meta.dirname, '..');

/** A filesystem import found in a module a plugin reaches at run time. */
interface Offender {
  module: string;
  specifier: string;
}

const PLUGIN_MODULES = findPluginModules();

describe('esbuild plugins are isolated from the filesystem', () => {
  // Derived rather than listed, so a plugin added to the build is covered without anyone extending a set here.
  it('reads every plugin the build registers', () => {
    expect(PLUGIN_MODULES).not.toStrictEqual([]);
  });

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

/** Returns the names of the factories called inside an esbuild `plugins` array. */
function collectPluginFactoryNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'plugins' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const element of node.initializer.elements) {
        if (ts.isCallExpression(element) && ts.isIdentifier(element.expression)) names.add(element.expression.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);

  return names;
}

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

/** Returns the modules `buildBundle` registers as esbuild plugins, named by their file. */
function findPluginModules(): string[] {
  const source = parseModule(path.join(COMPILE_DIR, 'buildBundle.ts'));
  const factoryNames = collectPluginFactoryNames(source);
  const fileNames: string[] = [];

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    if (bindings.elements.some((element) => factoryNames.has(element.name.text))) {
      fileNames.push(path.basename(statement.moduleSpecifier.text));
    }
  }

  return fileNames.toSorted((a, b) => a.localeCompare(b));
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

/** Parses a TypeScript module into a syntax tree. */
function parseModule(modulePath: string): ts.SourceFile {
  return ts.createSourceFile(modulePath, readFileSync(modulePath, 'utf8'), ts.ScriptTarget.Latest, true);
}

/**
 * Returns the specifiers a module imports for their values, in source order.
 *
 * Type-only imports are left out because they are erased: a type reaching a module that reads files says
 * nothing about what the importer can do at run time.
 */
function readValueImports(modulePath: string): string[] {
  const source = parseModule(modulePath);
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

// endregion | Helpers
