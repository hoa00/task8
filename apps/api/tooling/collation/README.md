# Pinned backend collation encoder

`src/shared/collation/icu78-en-US.wasm` encodes sort keys for the qualified Workerd 1.20261006.1 default `localeCompare`: ICU4C78.2, en-US, variant/tertiary, numeric off, punctuation significant, caseFirst off and normalization on. Chromium uses implicit Han weights. The original Chromium packaged collation data, not a newly generated CLDR catalogue, is included in the binary. The source revision, upstream data hash, filtered items and emitted binary hash are recorded in `provenance.json`. Unicode's license is in `LICENSE`.

Ordinary builds use the checked-in binary and need no native compiler. To reproduce it with Emscripten3.1.74 and host GCC/G++, Python3, curl, GNU make, rg and sha256sum installed:

```sh
COLLATION_EMSDK=/absolute/path/to/emsdk bash apps/api/tooling/collation/rebuild.sh
```

This optional tool downloads pinned public inputs into owned temporary storage, verifies input/output hashes, and removes that storage. It never deploys or overwrites the checked-in artifact. A changed ICU/runtime/data version requires a new text-key version, native differential verification and explicit backfill; changing this binary alone invalidates durable keys.

The portable `createTextKeyEncoder` accepts a compiled Wasm module. Worker and Node seed/backfill tooling supply their respective module loaders, sharing the same encoder and data. It accepts UTF16 code units so old cursor values with unpaired surrogates preserve ICU comparison. Its WASI environment is empty; there is no filesystem/network/clock import. Relational task sorts instead use `utf16Key`; search folding stays JavaScript `toLowerCase` with SQL literal `instr`.

Native differential tests compare D1 ordering by stored keys with Workerd `localeCompare`, including canonical accents, case, punctuation, mixed scripts, supplementary code points and unpaired surrogates. The test hook lives only in the integration Worker and is verified absent from production.
