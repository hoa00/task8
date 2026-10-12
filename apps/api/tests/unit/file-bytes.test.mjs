import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBytes, safeInline } from '../../src/modules/files/domain/bytes.ts';
import { createDiagnosticReporter } from '../../src/shared/diagnostics.ts';
test('preview formats require matching signatures and unsafe media stays attachment-only', () => {
  const cases = [
    ['image/png', [137, 80, 78, 71, 13, 10, 26, 10]],
    ['image/jpeg', [255, 216, 255]],
    ['image/gif', [...new TextEncoder().encode('GIF89a')]],
    ['image/webp', [...new TextEncoder().encode('RIFFxxxxWEBP')]],
  ];
  for (const [mimeType, bytes] of cases) {
    validateBytes({ name: 'preview', mimeType, bytes: new Uint8Array(bytes) });
    assert.throws(() => validateBytes({ name: 'preview', mimeType, bytes: new Uint8Array([0]) }), {
      code: 'VALIDATION_ERROR',
    });
    assert.equal(safeInline(mimeType), true);
  }
  assert.equal(safeInline('image/svg+xml'), false);
  assert.equal(safeInline('text/html'), false);
  for (const name of ['../x', 'folder/x', 'folder\\x', 'x\r\nheader'])
    assert.throws(() => validateBytes({ name, mimeType: 'text/plain', bytes: new Uint8Array() }), {
      code: 'VALIDATION_ERROR',
    });
});
test('file diagnostic logs correlate attempts without payload, hash, object key or error message', () => {
  const original = console.error,
    entries = [];
  console.error = (value) => entries.push(JSON.parse(value));
  try {
    const report = createDiagnosticReporter(
      { requestId: 'request', operation: 'uploadProjectFile', startedAt: 40 },
      { now: () => 42 },
    );
    report({
      phase: 'd1-commit-unconfirmed',
      errorCode: 'INTERNAL_ERROR',
      fileId: 'attempt',
      cause: new Error('PRIVATE_SENTINEL'),
    });
  } finally {
    console.error = original;
  }
  assert.deepEqual(entries, [
    {
      requestId: 'request',
      operation: 'uploadProjectFile',
      errorCode: 'INTERNAL_ERROR',
      errorType: 'Error',
      phase: 'd1-commit-unconfirmed',
      durationMs: 2,
      fileId: 'attempt',
    },
  ]);
  assert.equal(JSON.stringify(entries).includes('PRIVATE_SENTINEL'), false);
});
