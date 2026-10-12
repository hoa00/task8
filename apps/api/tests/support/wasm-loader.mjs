import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const encoderUrl = new URL('../../src/shared/collation/icu78-en-US.wasm', import.meta.url).href;
// Node's test runtime loads the same pinned binary that Wrangler supplies as a
// compiled Wasm module. This loader provides no alternate implementation or DB.
registerHooks({
  load(url, context, nextLoad) {
    if (url !== encoderUrl) return nextLoad(url, context);
    const bytes = readFileSync(new URL(url));
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default new WebAssembly.Module(Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),character=>character.charCodeAt(0)));`,
    };
  },
});
