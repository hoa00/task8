import type { EntityId } from '@studio/contracts/api';
export type TokenKind = 'access' | 'refresh';
export interface SessionCrypto {
  newSid(): string;
  hashSid(sid: string): Promise<string>;
  encrypt(token: string, id: EntityId, kind: TokenKind, version: number): Promise<string>;
  decrypt(ciphertext: string, id: EntityId, kind: TokenKind, version: number): Promise<string>;
}
