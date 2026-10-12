import module from './icu78-en-US.wasm';
import { createTextKeyEncoder } from '../text-key-encoder.ts';
export const textKeyEncoder = createTextKeyEncoder(module);
