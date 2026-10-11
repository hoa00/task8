import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
const root = resolve(import.meta.dirname, '../..');
const read = language => JSON.parse(readFileSync(resolve(root, `apps/web/src/i18n/locales/${language}.json`), 'utf8'));
const en = read('en'), vi = read('vi');
test('Both catalogs have the same messages; Vietnamese is complete and translated interpolations retain valid inputs', () => {
  assert.deepEqual(Object.keys(vi).sort(), Object.keys(en).sort());
  assert(Object.keys(vi).length > 1000);
  for (const [key, value] of Object.entries(vi)) {
    assert.equal(typeof value, 'string', key);
    assert(value.trim() || key === 's', `Empty Vietnamese translation: ${key}`);
    const englishVariables = new Set([...en[key].matchAll(/{{(\w+)}}/g)].map(match => match[1]));
    for (const match of value.matchAll(/{{(\w+)}}/g)) assert(englishVariables.has(match[1]), `Unknown interpolation ${match[1]} in ${key}`);
  }
});
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(directory, entry.name)) : /\.tsx?$/.test(entry.name) ? [resolve(directory, entry.name)] : []);
test('Every literal translation call in the app and shared UI exists in both catalogs', () => {
  for (const file of [...walk(resolve(root, 'apps/web/src')), ...walk(resolve(root, 'packages/ui/src'))]) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = node => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text;
        assert(Object.hasOwn(en, key) || Object.hasOwn(en, `${key}_one`) && Object.hasOwn(en, `${key}_other`), `${file}: missing translation ${key}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});
