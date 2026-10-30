import { z } from 'zod';
import type { LoginCrypto, LoginSecret } from '../domain/oidc-browser.ts';
import { ApiFailure } from '../../../shared/errors.ts';
interface Settings {
  environment: string;
  origin: string;
  issuer: string;
  clientId: string;
  keyset: { active: string; keys: Record<string, string> };
}
const Secret = z.strictObject({
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});
const Envelope = z.strictObject({
  version: z.literal(1),
  keyId: z.string(),
  iv: z.string(),
  ciphertext: z.string(),
});
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export function createLoginCrypto(settings: Settings): LoginCrypto {
  const aad = (id: string) =>
    new TextEncoder().encode(
      JSON.stringify([
        'task8',
        settings.environment,
        settings.origin,
        'login',
        1,
        id,
        settings.issuer,
        settings.clientId,
      ]),
    );
  async function key(id: string, usage: 'encrypt' | 'decrypt') {
    const value = Object.hasOwn(settings.keyset.keys, id) ? settings.keyset.keys[id] : undefined;
    if (!value)
      throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Sign-in encryption is unavailable');
    return crypto.subtle.importKey(
      'raw',
      decode(value.replaceAll('-', '+').replaceAll('_', '/')),
      'AES-GCM',
      false,
      [usage],
    );
  }
  return {
    async seal(id, secret) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad(id) },
        await key(settings.keyset.active, 'encrypt'),
        new TextEncoder().encode(JSON.stringify(Secret.parse(secret))),
      );
      return JSON.stringify({
        version: 1,
        keyId: settings.keyset.active,
        iv: encode(iv),
        ciphertext: encode(new Uint8Array(ciphertext)),
      });
    },
    async open(id, envelope): Promise<LoginSecret> {
      try {
        const data = Envelope.parse(JSON.parse(envelope)),
          iv = decode(data.iv);
        if (iv.length !== 12) throw new Error();
        return Secret.parse(
          JSON.parse(
            new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
              await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv, additionalData: aad(id) },
                await key(data.keyId, 'decrypt'),
                decode(data.ciphertext),
              ),
            ),
          ),
        );
      } catch {
        throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Sign-in encryption is unavailable');
      }
    },
  };
}
