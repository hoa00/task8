import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import ts from 'typescript';
import { root } from './output.mjs';

// Compare emitted syntax, ignoring trivia, quote choice and redundant parentheses.
export function semanticSyntax(file, text) {
  const emitted = ts.transpileModule(text, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      removeComments: true,
    },
  }).outputText;
  const source = ts.createSourceFile(
    'output.js',
    emitted,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  function visit(node) {
    if (ts.isParenthesizedExpression(node)) return visit(node.expression);
    const children = [];
    ts.forEachChild(node, (child) => {
      children.push(visit(child));
    });
    return [
      node.kind,
      ts.isIdentifier(node) || ts.isLiteralExpression(node) ? node.text : null,
      children,
    ];
  }
  return visit(source);
}
export async function formatFile(file, write = false) {
  const filename = resolve(root, file);
  const name = relative(root, filename).replaceAll('\\', '/');
  assert(
    /^(?:apps\/web\/|packages\/(?:ui|domain|contracts)\/|tests\/(?:frontend|workspace|data|i18n|contracts|visual)\/|eslint\.config\.mjs$)/.test(
      name,
    ),
    'Formatter accepts only non-API owners',
  );
  const info = await prettier.getFileInfo(filename, {
    ignorePath: resolve(root, '.prettierignore'),
  });
  assert(!info.ignored && info.inferredParser, `Generated, reference or unsupported file: ${name}`);
  const before = readFileSync(filename, 'utf8');
  const config = await prettier.resolveConfig(filename);
  const after = await prettier.format(before, { ...config, filepath: filename });
  assert.equal(
    await prettier.format(after, { ...config, filepath: filename }),
    after,
    `Formatter is not idempotent: ${name}`,
  );
  if (/\.(?:tsx?|mjs)$/.test(name))
    assert.deepEqual(
      semanticSyntax(name, before),
      semanticSyntax(name, after),
      `Formatter changes emitted syntax: ${name}`,
    );
  if (write && before !== after) writeFileSync(filename, after);
  return {
    file: name,
    changed: before !== after,
    idempotent: true,
    syntaxPreserved: /\.(?:tsx?|mjs)$/.test(name),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(
    args.every((arg) => !arg.startsWith('--') || ['--write', '--check'].includes(arg)),
    'Unknown formatter option',
  );
  const files = args.filter((arg) => !arg.startsWith('--'));
  const batch = files.length
    ? files
    : JSON.parse(readFileSync(new URL('./format-batch.json', import.meta.url), 'utf8'));
  const results = [];
  for (const file of batch) results.push(await formatFile(file, args.includes('--write')));
  console.log(JSON.stringify({ prettier: prettier.version, results }));
  if (!args.includes('--write') && results.some((result) => result.changed)) process.exitCode = 1;
}
