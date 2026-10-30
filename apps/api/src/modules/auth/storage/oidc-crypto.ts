import { z } from 'zod';
import type { OidcBinding, OidcCrypto, OidcTokens } from '../domain/oidc.ts';
import { ApiFailure } from '../../../shared/errors.ts';
const utf8 = new TextEncoder();
const Tokens = z.strictObject({
  access_token: z.string().min(1).max(32768),
  refresh_token: z.string().min(1).max(32768),
  id_token: z.string().min(1).max(32768).optional(),
});
const Envelope = z.strictObject({
  version: z.literal(1),
  keyId: z.string(),
  iv: z.string(),
  ciphertext: z.string(),
});
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const decode = (value: string) =>
  Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
export interface OidcCryptoSettings {
  environment: string;
  origin: string;
  keyset: { active: string; keys: Record<string, string> };
}
export function createOidcCrypto(settings: OidcCryptoSettings): OidcCrypto {
  const aad = (row: OidcBinding) =>
    utf8.encode(
      JSON.stringify([
        'task8',
        settings.environment,
        settings.origin,
        'tokens',
        1,
        row.id,
        row.linkId,
        row.issuer,
        row.clientId,
        row.providerSid,
        row.subject,
      ]),
    );
  const key = async (keyId: string, usage: 'encrypt' | 'decrypt') => {
    const material = Object.hasOwn(settings.keyset.keys, keyId)
      ? settings.keyset.keys[keyId]
      : undefined;
    if (!material) throw new Error('Unavailable token key');
    return crypto.subtle.importKey('raw', decode(material), 'AES-GCM', false, [usage]);
  };
  return {
    newSid: () => encode(crypto.getRandomValues(new Uint8Array(32))),
    async hashSid(sid) {
      return Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(sid))),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
    },
    async seal(row, tokens) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad(row) },
        await key(settings.keyset.active, 'encrypt'),
        utf8.encode(JSON.stringify(Tokens.parse(tokens))),
      );
      return JSON.stringify({
        version: 1,
        keyId: settings.keyset.active,
        iv: encode(iv),
        ciphertext: encode(new Uint8Array(ciphertext)),
      });
    },
    async open(row, envelope): Promise<OidcTokens> {
      try {
        const data = Envelope.parse(JSON.parse(envelope));
        const iv = decode(data.iv);
        if (iv.length !== 12) throw new Error();
        const bytes = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv, additionalData: aad(row) },
          await key(data.keyId, 'decrypt'),
          decode(data.ciphertext),
        );
        const tokens = Tokens.parse(
          JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)),
        );
        return {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          ...(tokens.id_token ? { id_token: tokens.id_token } : {}),
        };
      } catch {
        throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Session encryption is unavailable');
      }
    },
  };
}
