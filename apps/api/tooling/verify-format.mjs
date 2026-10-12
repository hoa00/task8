import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const baseline = process.argv[2];
assert(baseline && /^[a-f0-9]{40}$/.test(baseline), 'Explicit full baseline commit SHA required');
const git = (args) => {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
function semanticAst(path, content) {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  assert.equal(source.parseDiagnostics.length, 0, path);
  function visit(node) {
    if (ts.isParenthesizedExpression(node)) return visit(node.expression);
    if (ts.isParenthesizedTypeNode(node)) return visit(node.type);
    const children = [];
    ts.forEachChild(node, (child) => {
      children.push(visit(child));
    });
    return {
      kind:
        ts.isStringLiteral(node) &&
        node.parent &&
        ts.isPropertyAssignment(node.parent) &&
        node.parent.name === node
          ? ts.SyntaxKind.Identifier
          : node.kind,
      flags: node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.OptionalChain),
      ...(!ts.isSourceFile(node) && typeof node.text === 'string' ? { text: node.text } : {}),
      ...(node.isTypeOnly !== undefined ? { isTypeOnly: node.isTypeOnly } : {}),
      children,
    };
  }
  return JSON.stringify(visit(source));
}
const paths = git([
  'ls-tree',
  '-r',
  '--name-only',
  baseline,
  'apps/api/src',
  'apps/api/drizzle.config.ts',
])
  .trim()
  .split('\n')
  .filter((path) => path.endsWith('.ts') && !path.includes('/migrations/'));
const files = paths.map((path) => {
  const before = git(['show', baseline + ':' + path]);
  const after = readFileSync(new URL(path, 'file://' + root), 'utf8');
  const original = semanticAst(path, before),
    formatted = semanticAst(path, after);
  assert.equal(hash(original), hash(formatted), 'Semantic AST changed: ' + path);
  return {
    path,
    beforeSha256: hash(before),
    afterSha256: hash(after),
    semanticAstSha256: hash(original),
  };
});
console.log(JSON.stringify({ status: 'PASS', baseline, files }, null, 2));
