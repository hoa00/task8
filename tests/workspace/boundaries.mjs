import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const allowed = {
  ui: new Set(['react', 'react-dom']),
  contracts: new Set(['zod']),
  domain: new Set(['@studio/contracts']),
};
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const filename = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(filename) : /\.(ts|tsx)$/.test(filename) ? [filename] : [];
});

export function validateImport(owner, specifier) {
  if (specifier.startsWith('.')) {
    assert(!specifier.split('/').includes('apps'), `${owner} cannot import apps`);
    return;
  }
  const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
  assert(allowed[owner].has(packageName), `${owner} cannot depend on ${packageName}`);
}

export function checkBoundaries() {
  let sourceFiles = 0;
  for (const owner of Object.keys(allowed)) {
    const directory = path.join(root, 'packages', owner);
    const pkg = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) validateImport(owner, dependency);
    for (const filename of walk(path.join(directory, 'src'))) {
      sourceFiles++;
      const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = node => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text;
          validateImport(owner, specifier);
          if (specifier.startsWith('.')) {
            const target = path.resolve(path.dirname(filename), specifier);
            assert(target.startsWith(path.join(directory, 'src') + path.sep), `${owner} cannot import another package by relative path`);
          }
        }
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')) {
          assert(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]), `${owner} requires static imports`);
          validateImport(owner, node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return { packages: Object.keys(allowed), sourceFiles, status: 'passed' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(checkBoundaries()));
