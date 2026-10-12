import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTextKeyEncoder,
  utf16Key,
  encodedTextFields,
  textKeyVersion,
} from '../../src/shared/text-key-encoder.ts';
const encoder = createTextKeyEncoder(
  await WebAssembly.compile(
    readFileSync(new URL('../../src/shared/collation/icu78-en-US.wasm', import.meta.url)),
  ),
);
test('pinned collation handles canonical equality, accent/case and unpaired cursor values', () => {
  assert.equal(encoder.locale('é'), encoder.locale('e\u0301'));
  for (const [a, b] of [
    ['a', 'ä'],
    ['ä', 'B'],
    ['B', 'z'],
    ['\ud800', '\udfff'],
    ['\udfff', '\ufffd'],
  ])
    assert(encoder.locale(a) < encoder.locale(b), JSON.stringify({ a, b }));
  assert.notEqual(encoder.locale('A'), encoder.locale('a'));
  assert.notEqual(encoder.locale('\ud800'), encoder.locale('\ufffd'));
});
test('UTF16 keys retain supplementary and prefix order independently of locale', () => {
  assert(utf16Key('\u{10000}') < utf16Key('\ue000'));
  assert(utf16Key('a') < utf16Key('aa'));
  assert.equal(utf16Key(''), '');
  assert.equal(utf16Key('\ud800'), 'd800');
});
test('derived fields keep literal Unicode folding and JavaScript numeric conversion', () => {
  const result = JSON.parse(
    encodedTextFields(
      { name: 'İSTANBUL', title: 'Ä%_', number: '0x10', nonNumber: '1xx' },
      encoder,
    ),
  );
  assert.equal(result.v, textKeyVersion);
  assert.equal(result.name.fold, 'i\u0307stanbul');
  assert.equal(result.title.fold, 'ä%_');
  assert.equal(result.number.numeric, 16);
  assert.equal(result.nonNumber.numeric, null);
});

test('derived D1 keys match the native WTF8 read projection while cursor keys keep lone units', () => {
  const fields = JSON.parse(encodedTextFields({ name: 'Lone \ud800', paired: '𐀀' }, encoder));
  assert.equal(fields.name.fold, 'lone \ufffd\ufffd\ufffd');
  assert.equal(fields.name.locale, encoder.locale('Lone \ufffd\ufffd\ufffd'));
  assert.equal(fields.paired.utf16, 'd800dc00');
  assert.notEqual(fields.name.locale, encoder.locale('Lone \ud800'));
});
