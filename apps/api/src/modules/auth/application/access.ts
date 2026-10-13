export interface VerifiedAccess {
  subject: string;
  tenant: string;
  expiresAt: number;
}

export interface AccessVerifier {
  verify(token: string): Promise<VerifiedAccess>;
}
