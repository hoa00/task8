import type { EntityId } from '@studio/contracts/api';
import { ApiFailure } from '../../../shared/errors.ts';
import type { SessionCrypto, TokenKind } from '../domain/crypto.ts';
const encoder = new TextEncoder();
function encode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
}
export function createSessionCrypto(secret: string): SessionCrypto {
  let bytes;
  try {
    bytes = decode(secret);
    if (bytes.length !== 32 || encode(bytes) !== secret) throw new Error();
  } catch {
    throw new Error('Invalid authentication encryption configuration');
  }
  const key = crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  const aad = (id: EntityId, kind: TokenKind, version: number) =>
    encoder.encode(`task8:${id}:${kind}:${version}`);
  return {
    newSid: () => encode(crypto.getRandomValues(new Uint8Array(32))),
    async hashSid(sid) {
      return Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(sid))),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
    },
    async encrypt(token, id, kind, version) {
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad(id, kind, version) },
        await key,
        encoder.encode(token),
      );
      return encode(nonce) + '.' + encode(new Uint8Array(ciphertext));
    },
    async decrypt(ciphertext, id, kind, version) {
      try {
        const [nonce, value, ...extra] = ciphertext.split('.');
        if (!nonce || !value || extra.length || decode(nonce).length !== 12) throw new Error();
        const bytes = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: decode(nonce), additionalData: aad(id, kind, version) },
          await key,
          decode(value),
        );
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
      } catch {
        throw new ApiFailure('UNAUTHENTICATED', 'Authentication required');
      }
    },
  };
}
