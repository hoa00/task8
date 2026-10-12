import { ApiFailure } from './errors.ts';

export const textKeyVersion = 'icu78.2-chromium-en-US-implicitHan-v1';
export interface TextKeyEncoder {
  locale(value: string): string;
  lower(value: string): string;
}

// The supplied module is immutable, pinned ICU data. Each instance owns its memory;
// calls are synchronous, so no request state can escape between invocations.
export function createTextKeyEncoder(module: WebAssembly.Module): TextKeyEncoder {
  const memorySlot: { value?: WebAssembly.Memory } = {};
  const instance = new WebAssembly.Instance(module, {
    env: { emscripten_notify_memory_growth() {} },
    wasi_snapshot_preview1: {
      environ_sizes_get(count: number, bytes: number) {
        if (!memorySlot.value) throw new ApiFailure('INTERNAL_ERROR', 'Encoder memory unavailable');
        const view = new DataView(memorySlot.value.buffer);
        view.setUint32(count, 0, true);
        view.setUint32(bytes, 0, true);
        return 0;
      },
      environ_get() {
        return 0;
      },
    },
  });
  const exports = instance.exports;
  if (!(exports.memory instanceof WebAssembly.Memory))
    throw new ApiFailure('INTERNAL_ERROR', 'Invalid text encoder memory');
  memorySlot.value = exports.memory;
  const allocate = exports.allocate,
    release = exports.release,
    sortKey = exports.sort_key,
    initialize = exports._initialize,
    init = exports.init,
    lower = exports.lower_utf16;
  if (
    typeof allocate !== 'function' ||
    typeof release !== 'function' ||
    typeof sortKey !== 'function' ||
    typeof initialize !== 'function' ||
    typeof init !== 'function' ||
    typeof lower !== 'function'
  )
    throw new ApiFailure('INTERNAL_ERROR', 'Invalid text encoder ABI');
  initialize();
  if (init() !== 0) throw new ApiFailure('INTERNAL_ERROR', 'Text encoder initialization failed');
  const allocateBytes = (bytes: number): number => {
    const pointer: unknown = allocate(bytes);
    if (typeof pointer !== 'number' || !Number.isInteger(pointer) || pointer <= 0)
      throw new ApiFailure('INTERNAL_ERROR', 'Text encoder allocation failed');
    return pointer;
  };
  const encoderMemory = exports.memory;
  return {
    lower(value: string): string {
      const input = allocateBytes(Math.max(2, value.length * 2));
      try {
        const units = new Uint16Array(encoderMemory.buffer);
        for (let index = 0; index < value.length; index++)
          units[input / 2 + index] = value.charCodeAt(index);
        const length: unknown = lower(input, value.length, 0, 0);
        if (typeof length !== 'number' || !Number.isInteger(length) || length < 0)
          throw new ApiFailure('INTERNAL_ERROR', 'Text folding failed');
        const output = allocateBytes(Math.max(2, length * 2));
        try {
          if (lower(input, value.length, output, length) !== length)
            throw new ApiFailure('INTERNAL_ERROR', 'Text folding output changed');
          return Array.from(new Uint16Array(encoderMemory.buffer, output, length), (unit) =>
            String.fromCharCode(unit),
          ).join('');
        } finally {
          release(output);
        }
      } finally {
        release(input);
      }
    },
    locale(value: string): string {
      const input = allocateBytes(Math.max(2, value.length * 2));
      try {
        const units = new Uint16Array(encoderMemory.buffer);
        for (let index = 0; index < value.length; index++)
          units[input / 2 + index] = value.charCodeAt(index);
        const length: unknown = sortKey(input, value.length, 0, 0);
        if (typeof length !== 'number' || !Number.isInteger(length) || length <= 0)
          throw new ApiFailure('INTERNAL_ERROR', 'Text encoder failed');
        const output = allocateBytes(length);
        try {
          if (sortKey(input, value.length, output, length) !== length)
            throw new ApiFailure('INTERNAL_ERROR', 'Text encoder output changed');
          return Array.from(new Uint8Array(encoderMemory.buffer, output, length), (byte) =>
            byte.toString(16).padStart(2, '0'),
          ).join('');
        } finally {
          release(output);
        }
      } finally {
        release(input);
      }
    },
  };
}

// Fixed-width code units preserve JavaScript relational comparison, including
// supplementary characters and unpaired surrogates. This is NOT locale collation.
export function utf16Key(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index++)
    result += value.charCodeAt(index).toString(16).padStart(4, '0');
  return result;
}

// Qualified D1 stores lone UTF16 surrogates as WTF8 bytes; its JS result
// decoder exposes one U+FFFD per invalid byte (three per surrogate). Derived
// fields match that read projection while cursor keys keep their original units.
export function d1ReadText(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index),
      next = value.charCodeAt(index + 1);
    if (unit >= 0xd800 && unit <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      result += value.slice(index, index + 2);
      index++;
    } else if (unit >= 0xd800 && unit <= 0xdfff) result += '\ufffd\ufffd\ufffd';
    else result += value[index];
  }
  return result;
}
function numericType(value: number): 'finite' | 'NaN' | '+Infinity' | '-Infinity' {
  return Number.isNaN(value)
    ? 'NaN'
    : value === Infinity
      ? '+Infinity'
      : value === -Infinity
        ? '-Infinity'
        : 'finite';
}
function textField(value: string, encoder: TextKeyEncoder) {
  const stored = d1ReadText(value),
    numeric = Number(stored),
    fold = encoder.lower(stored),
    foldedNumeric = Number(fold);
  return {
    fold,
    utf16: utf16Key(stored),
    foldedUtf16: utf16Key(fold),
    locale: encoder.locale(stored),
    numeric: Number.isFinite(numeric) ? numeric : null,
    foldedNumeric: Number.isFinite(foldedNumeric) ? foldedNumeric : null,
    foldedNumericType: numericType(foldedNumeric),
    numericType: numericType(numeric),
  };
}
function encodedFields(
  fields: Readonly<Record<string, string>>,
  searchFields: Readonly<Record<string, string>>,
  encoder: TextKeyEncoder,
) {
  return {
    ...Object.fromEntries(
      Object.entries(searchFields).map(([name, value]) => [
        name,
        { fold: encoder.lower(d1ReadText(value)) },
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(fields).map(([name, value]) => [name, textField(value, encoder)]),
    ),
  };
}
export function encodedTextFields(
  fields: Readonly<Record<string, string>>,
  encoder: TextKeyEncoder,
  searchFields: Readonly<Record<string, string>> = {},
): string {
  return JSON.stringify({ v: textKeyVersion, ...encodedFields(fields, searchFields, encoder) });
}
export function encodedTextPatch(
  fields: Readonly<Record<string, string>>,
  encoder: TextKeyEncoder,
  searchFields: Readonly<Record<string, string>> = {},
): string {
  return JSON.stringify(encodedFields(fields, searchFields, encoder));
}
