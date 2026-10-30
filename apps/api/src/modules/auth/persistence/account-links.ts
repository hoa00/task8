export type LinkValue = string | number | null;
import type { RequestRepository } from '../../../db/client.ts';
import type {
  LinkTarget,
  LinkRow,
  LinkSnapshot,
  LinkCommand,
  LinkReceipt,
} from '../domain/account-links.ts';
export class AccountLinkError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function reject(code: string): never {
  throw new AccountLinkError(code);
}
const userProjection =
  "json_object('id',u.id,'version',u.version,'updatedAt',u.updatedAt,'lastMutationId',u.lastMutationId)";
const userQuery = `SELECT ${userProjection} snapshot FROM users u WHERE u.id=?`;
const memberProjection =
  "json_object('id',m.id,'workspaceId',m.workspaceId,'userId',m.userId,'role',m.role,'status',m.status,'removedAt',m.removedAt,'version',m.version,'workspaceVersion',t.version)";
const sourceProjection =
  "json_object('id',i.id,'providerKey',i.providerKey,'tenant',i.tenant,'subject',i.subject,'userId',i.userId,'createdAt',i.createdAt)";
const sourceQuery = `SELECT ${sourceProjection} snapshot FROM authIdentities i WHERE i.providerKey=? AND i.tenant=? AND i.subject=? AND i.userId=?`;
const linkQuery = `SELECT id,issuer,subject,userId userId,status,revision,createdAt createdAt,createdBy createdBy,migrationBatchId migrationBatchId FROM oidcIdentityLinks WHERE issuer=? AND (subject=? OR userId=?)`;
const receiptQuery = `SELECT manifestId,manifestDigest,entryId,linkId,issuer,subject,localUserId,outcome,revision,actor,correlation,createdAt,revokedAt,revokedRevision,revokeKind FROM oidcLinkOperations WHERE manifestId=? AND entryId=?`;
function inputGuard(command: LinkCommand) {
  if (
    !command ||
    !/^[a-f0-9]{64}$/u.test(command.manifestDigest) ||
    !command.manifestId ||
    !command.entryId ||
    !command.actor ||
    !command.correlation ||
    !Number.isSafeInteger(command.now) ||
    command.now <= 0 ||
    !['existing-local-user', 'legacy-ict24h'].includes(command.target.source.kind) ||
    (command.target.source.kind === 'existing-local-user' &&
      command.target.source.localUserId !== command.target.localUserId) ||
    command.target.expectedLink !== 'absent-or-identical' ||
    command.target.verifyOnlyMemberships.length > 100 ||
    command.snapshot.memberships.length !== command.target.verifyOnlyMemberships.length
  )
    reject('LINK_INPUT_INVALID');
}
export async function inspectLink(
  repository: RequestRepository,
  issuer: string,
  subject: string,
  target: LinkTarget,
): Promise<LinkSnapshot> {
  const user =
    (await repository.all<{ snapshot: string }>(userQuery, [target.localUserId]))[0]?.snapshot ??
    null;
  const memberships: string[] = [];
  const memberRows = await repository.all<{ snapshot: string }>(
    `SELECT ${memberProjection} snapshot FROM json_each(?) expected JOIN workspaceMembers m ON m.id=json_extract(expected.value,'$.memberId') AND m.workspaceId=json_extract(expected.value,'$.workspaceId') JOIN workspaces t ON t.id=m.workspaceId WHERE m.userId=? ORDER BY CAST(expected.key AS INTEGER)`,
    [JSON.stringify(target.verifyOnlyMemberships), target.localUserId],
  );
  memberships.push(...memberRows.map((row) => row.snapshot));
  const source =
    target.source.kind === 'legacy-ict24h'
      ? ((
          await repository.all<{ snapshot: string }>(sourceQuery, [
            target.source.providerKey,
            target.source.tenant,
            target.source.subject,
            target.localUserId,
          ])
        )[0]?.snapshot ?? null)
      : null;
  const links = await repository.all<LinkRow>(linkQuery, [issuer, subject, target.localUserId]);
  const link = links[0] ?? null;
  const conflict =
    links.length > 1 ||
    (link !== null &&
      (link.subject !== subject || link.userId !== target.localUserId || link.status !== 'active'));
  const outcome = !user
    ? 'missing-user'
    : target.source.kind === 'legacy-ict24h' && !source
      ? 'source-mismatch'
      : memberships.length !== target.verifyOnlyMemberships.length
        ? 'missing-membership'
        : conflict
          ? 'conflict'
          : link
            ? 'already-linked'
            : 'create-link';
  return { user, source, memberships, link, outcome };
}
// Every mutable precondition is repeated at the winning SQL statement. Reading
// a plan is not a lock; a zero-row root must never create an operation or audit.
function currentGuard(command: LinkCommand) {
  return {
    sql: `EXISTS(${userQuery} AND ${userProjection}=?) AND NOT EXISTS(SELECT 1 FROM json_each(?) expected WHERE NOT EXISTS(SELECT 1 FROM workspaceMembers m JOIN workspaces t ON t.id=m.workspaceId WHERE m.id=json_extract(expected.value,'$.id') AND m.userId=? AND ${memberProjection}=expected.value)) ${command.target.source.kind === 'legacy-ict24h' ? `AND EXISTS(${sourceQuery} AND ${sourceProjection}=?)` : ''}`,
    values: [
      command.target.localUserId,
      command.snapshot.user,
      JSON.stringify(command.snapshot.memberships),
      command.target.localUserId,
      ...(command.target.source.kind === 'legacy-ict24h'
        ? [
            command.target.source.providerKey,
            command.target.source.tenant,
            command.target.source.subject,
            command.target.localUserId,
            command.snapshot.source,
          ]
        : []),
    ] as LinkValue[],
  };
}
// A concurrent winner is reusable only while the same current command remains valid.
// This SELECT is also the final statement of the mutation batch, not an unguarded ledger read.
function currentApplyReceipt(command: LinkCommand) {
  const guard = currentGuard(command);
  const expected = command.snapshot.link;
  return {
    sql: `${receiptQuery} AND manifestDigest=? AND issuer=? AND subject=? AND localUserId=? AND revokedAt IS NULL AND ${guard.sql} AND NOT EXISTS(SELECT 1 FROM oidcLinkOperations WHERE manifestId=? AND manifestDigest<>?) AND EXISTS(SELECT 1 FROM oidcIdentityLinks l WHERE l.id=oidcLinkOperations.linkId AND l.issuer=oidcLinkOperations.issuer AND l.subject=oidcLinkOperations.subject AND l.userId=oidcLinkOperations.localUserId AND l.status='active' AND l.revision=oidcLinkOperations.revision ${expected ? 'AND l.id=? AND l.revision=?' : ''})`,
    values: [command.manifestId, command.entryId, command.manifestDigest, command.issuer, command.subject, command.target.localUserId, ...guard.values, command.manifestId, command.manifestDigest, ...(expected ? [expected.id, expected.revision] : [])],
  };
}
function receiptOwner(receipt: LinkReceipt) {
  return {
    sql: 'manifestId=? AND entryId=? AND manifestDigest=? AND linkId=? AND issuer=? AND subject=? AND localUserId=? AND outcome=? AND revision=? AND actor=? AND correlation=? AND createdAt=?',
    values: [receipt.manifestId, receipt.entryId, receipt.manifestDigest, receipt.linkId, receipt.issuer, receipt.subject, receipt.localUserId, receipt.outcome, receipt.revision, receipt.actor, receipt.correlation, receipt.createdAt],
  };
}
function currentRevokedReceipt(receipt: LinkReceipt) {
  const owner = receiptOwner(receipt);
  return {
    sql: `${receiptQuery} AND ${owner.sql} AND revokedAt IS NOT NULL AND revokedRevision=revision+1 AND EXISTS(SELECT 1 FROM oidcIdentityLinks l WHERE l.id=oidcLinkOperations.linkId AND l.issuer=oidcLinkOperations.issuer AND l.subject=oidcLinkOperations.subject AND l.userId=oidcLinkOperations.localUserId AND l.status='revoked' AND l.revision=oidcLinkOperations.revokedRevision AND l.migrationBatchId=?)`,
    values: [receipt.manifestId, receipt.entryId, ...owner.values, JSON.stringify([receipt.manifestId, receipt.entryId])],
  };
}
export async function applyLink(
  repository: RequestRepository,
  command: LinkCommand,
): Promise<LinkReceipt> {
  inputGuard(command);
  if (
    !['create-link', 'already-linked'].includes(command.snapshot.outcome) ||
    !command.snapshot.user
  )
    reject('PLAN_CONFLICT');
  const guard = currentGuard(command);
  const previous = (
    await repository.all<LinkReceipt>(receiptQuery, [command.manifestId, command.entryId])
  )[0];
  if (previous) {
    const current = await lookupLinkReceipt(repository, command);
    if (!current) reject('STALE_PLAN');
    return current;
  }
  const selectedReceipt = currentApplyReceipt(command);
  const marker = command.marker;
  const operationKey = JSON.stringify([command.manifestId, command.entryId]);
  const noChangedManifest =
    'NOT EXISTS(SELECT 1 FROM oidcLinkOperations WHERE manifestId=? AND manifestDigest<>?)';
  const exactLink = `l.issuer=? AND l.subject=? AND l.userId=? AND l.status='active'`;
  const values = [command.issuer, command.subject, command.target.localUserId];
  const snapshotLink = command.snapshot.link;
  const expectedLink = snapshotLink ? `l.id=? AND l.revision=?` : '1';
  const expectedValues: LinkValue[] = snapshotLink ? [snapshotLink.id, snapshotLink.revision] : [];
  const statements = [
    repository.prepare(
      `INSERT INTO oidcIdentityLinks(id,issuer,subject,userId,status,createdAt,createdBy,migrationBatchId,revision) SELECT ?,?,?,?,'active',?,?,?,1 WHERE ${guard.sql} AND ${noChangedManifest} AND NOT EXISTS(SELECT 1 FROM oidcIdentityLinks WHERE issuer=? AND (subject=? OR userId=?)) ON CONFLICT DO NOTHING`,
      [
        command.candidateId,
        ...values,
        command.now,
        command.actor,
        operationKey,
        ...guard.values,
        command.manifestId,
        command.manifestDigest,
        ...values,
      ],
    ),
    repository.prepare(
      `INSERT INTO oidcLinkOperations(manifestId,manifestDigest,entryId,linkId,issuer,subject,localUserId,outcome,revision,actor,correlation,createdAt,marker) SELECT ?,?,?,l.id,l.issuer,l.subject,l.userId,CASE WHEN l.id=? THEN 'created-by-this-operation' ELSE 'already-linked' END,l.revision,?,?,?,? FROM oidcIdentityLinks l WHERE ${exactLink} AND ${expectedLink} AND ${guard.sql} AND ${noChangedManifest} ON CONFLICT DO NOTHING`,
      [
        command.manifestId,
        command.manifestDigest,
        command.entryId,
        command.candidateId,
        command.actor,
        command.correlation,
        command.now,
        marker,
        ...values,
        ...expectedValues,
        ...guard.values,
        command.manifestId,
        command.manifestDigest,
      ],
    ),
    repository.prepare(
      `INSERT INTO oidcLinkAudit(id,manifestId,entryId,linkId,kind,actor,correlation,beforeRevision,afterRevision,createdAt) SELECT ?,manifestId,entryId,linkId,'apply',actor,correlation,CASE WHEN outcome='created-by-this-operation' THEN 0 ELSE revision END,revision,createdAt FROM oidcLinkOperations WHERE manifestId=? AND entryId=? AND marker=?`,
      [marker, command.manifestId, command.entryId, marker],
    ),
    repository.prepare(selectedReceipt.sql, selectedReceipt.values),
  ];
  const result = await repository.batch<LinkReceipt>(statements);
  const receipt = result[3]?.results[0];
  if (!receipt || receipt.manifestDigest !== command.manifestDigest || receipt.revokedAt !== null)
    reject('LINK_CONFLICT');
  return receipt;
}
export async function revokeLink(
  repository: RequestRepository,
  receipt: LinkReceipt,
  context: {
    actor: string;
    correlation: string;
    marker: string;
    now: number;
    kind: 'rollback' | 'revoke';
  },
): Promise<LinkReceipt> {
  if (
    !context.actor ||
    !context.correlation ||
    !Number.isSafeInteger(context.now) ||
    context.now <= 0 ||
    !['rollback', 'revoke'].includes(context.kind)
  )
    reject('LINK_INPUT_INVALID');
  const previous = (
    await repository.all<LinkReceipt>(receiptQuery, [receipt.manifestId, receipt.entryId])
  )[0];
  if (
    !previous ||
    previous.manifestDigest !== receipt.manifestDigest ||
    previous.linkId !== receipt.linkId ||
    previous.localUserId !== receipt.localUserId ||
    previous.issuer !== receipt.issuer ||
    previous.subject !== receipt.subject ||
    previous.revision !== receipt.revision ||
    previous.outcome !== receipt.outcome ||
    previous.actor !== receipt.actor ||
    previous.correlation !== receipt.correlation ||
    previous.createdAt !== receipt.createdAt
  )
    reject('RECEIPT_CONFLICT');
  if (previous.outcome === 'already-linked') return previous;
  const selectedReceipt = currentRevokedReceipt(receipt);
  if (previous.revokedAt !== null) {
    const current = (await repository.all<LinkReceipt>(selectedReceipt.sql, selectedReceipt.values))[0];
    if (!current) reject('LINK_REVISION_CONFLICT');
    return current;
  }
  const ledgerOwner = receiptOwner(receipt);
  const owner = `id=? AND issuer=? AND subject=? AND userId=? AND revision=? AND status='active'`;
  const owned = [
    receipt.linkId,
    receipt.issuer,
    receipt.subject,
    receipt.localUserId,
    receipt.revision,
  ];
  const result = await repository.batch<LinkReceipt>([
    repository.prepare(
      `UPDATE oidcLinkOperations SET revokedAt=?,revokedRevision=revision+1,revokeKind=?,revokeActor=?,revokeCorrelation=?,revokeMarker=? WHERE ${ledgerOwner.sql} AND revokedAt IS NULL AND EXISTS(SELECT 1 FROM oidcIdentityLinks WHERE ${owner} AND migrationBatchId=?)`,
      [
        context.now,
        context.kind,
        context.actor,
        context.correlation,
        context.marker,
        ...ledgerOwner.values,
        ...owned,
        JSON.stringify([receipt.manifestId, receipt.entryId]),
      ],
    ),
    repository.prepare(
      `UPDATE oidcIdentityLinks SET status='revoked',revision=revision+1 WHERE ${owner} AND EXISTS(SELECT 1 FROM oidcLinkOperations WHERE manifestId=? AND entryId=? AND revokeMarker=?)`,
      [...owned, receipt.manifestId, receipt.entryId, context.marker],
    ),
    repository.prepare(
      `UPDATE oidcAppSessions SET revokedAt=COALESCE(revokedAt,?),bundle='',refreshInput=NULL,refreshAttemptAt=0,leaseOwner=NULL,leaseUntil=0,revision=revision+1 WHERE linkId=? AND EXISTS(SELECT 1 FROM oidcLinkOperations WHERE manifestId=? AND entryId=? AND revokeMarker=?)`,
      [context.now, receipt.linkId, receipt.manifestId, receipt.entryId, context.marker],
    ),
    repository.prepare(
      `INSERT INTO oidcLinkAudit(id,manifestId,entryId,linkId,kind,actor,correlation,beforeRevision,afterRevision,createdAt) SELECT ?,manifestId,entryId,linkId,revokeKind,revokeActor,revokeCorrelation,revision,revokedRevision,revokedAt FROM oidcLinkOperations WHERE manifestId=? AND entryId=? AND revokeMarker=?`,
      [context.marker, receipt.manifestId, receipt.entryId, context.marker],
    ),
    repository.prepare(selectedReceipt.sql, selectedReceipt.values),
  ]);
  const canonical = result[4]?.results[0];
  if (!canonical || canonical.revokedAt === null) reject('LINK_REVISION_CONFLICT');
  return canonical;
}

export async function lookupLinkReceipt(
  repository: RequestRepository,
  command: LinkCommand,
): Promise<LinkReceipt | null> {
  inputGuard(command);
  const selected = currentApplyReceipt(command);
  return (await repository.all<LinkReceipt>(selected.sql, selected.values))[0] ?? null;
}
