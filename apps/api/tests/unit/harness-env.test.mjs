import assert from 'node:assert/strict';
import { test } from 'node:test';
import { privateVarsText } from '../support/harness.mjs';
test('private fixture JSON and PEM remain literal under the installed dotenv quote semantics', () => {
  const keyset = JSON.stringify({ active: 'fixture', keys: { fixture: 'synthetic-key-material' } });
  const pem = '-----BEGIN TEST KEY-----\nsynthetic\n-----END TEST KEY-----';
  const text = privateVarsText({ RP_TOKEN_ENCRYPTION_KEYSET: keyset, TEST_PEM: pem });
  assert(text.includes(keyset));
  assert(text.includes(pem));
  assert(!text.includes('\\"'));
  assert(text.includes("RP_TOKEN_ENCRYPTION_KEYSET='{"));
  assert(text.includes("TEST_PEM='-----BEGIN TEST KEY-----\n"));
  assert.equal(
    privateVarsText({ TEST_VALUE: "with an apostrophe's value" }),
    "TEST_VALUE=`with an apostrophe's value`\n",
  );
  assert.equal(
    privateVarsText({ TEST_VALUE: 'literal\\n and # comment' }),
    "TEST_VALUE='literal\\n and # comment'\n",
  );
});
test('unsupported fixture secret shapes fail without echoing secret values', () => {
  for (const input of [
    { 'BAD-NAME': 'sensitive-value' },
    { TEST_VALUE: 42 },
    { TEST_VALUE: 'with\rreturn' },
    { TEST_VALUE: "both'and`delimiters" },
  ])
    assert.throws(
      () => privateVarsText(input),
      (error) =>
        error instanceof TypeError &&
        !error.message.includes('sensitive-value') &&
        !error.message.includes('delimiters'),
    );
});
