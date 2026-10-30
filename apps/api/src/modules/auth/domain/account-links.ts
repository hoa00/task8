export interface LinkTarget {
  localUserId: string;
  source:
    | { kind: 'existing-local-user'; localUserId: string }
    | { kind: 'legacy-ict24h'; providerKey: 'ict24h-identity'; tenant: string; subject: string };
  expectedLink: 'absent-or-identical';
  verifyOnlyMemberships: { workspaceId: string; memberId: string }[];
}
export interface LinkRow {
  id: string;
  issuer: string;
  subject: string;
  userId: string;
  status: string;
  revision: number;
  createdAt: number;
  createdBy: string;
  migrationBatchId: string;
}
export interface LinkSnapshot {
  user: string | null;
  source: string | null;
  memberships: string[];
  link: LinkRow | null;
  outcome: string;
}
export interface LinkCommand {
  manifestId: string;
  manifestDigest: string;
  entryId: string;
  issuer: string;
  subject: string;
  target: LinkTarget;
  snapshot: LinkSnapshot;
  actor: string;
  correlation: string;
  candidateId: string;
  marker: string;
  now: number;
}
export interface LinkReceipt {
  manifestId: string;
  manifestDigest: string;
  entryId: string;
  linkId: string;
  issuer: string;
  subject: string;
  localUserId: string;
  outcome: 'created-by-this-operation' | 'already-linked';
  revision: number;
  actor: string;
  correlation: string;
  createdAt: number;
  revokedAt: number | null;
  revokedRevision: number | null;
  revokeKind: string | null;
}
