import { sql } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTableExtraConfigValue } from 'drizzle-orm/sqlite-core';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const timestamps = () => ({
  createdAt: integer('createdAt').notNull(),
  updatedAt: integer('updatedAt').notNull(),
});
const mutable = () => ({
  version: integer('version').notNull().default(1),
  lastMutationId: text('lastMutationId'),
});
const tombstone = () => ({ deletedAt: integer('deletedAt'), deletedBy: text('deletedBy') });
export const users = sqliteTable(
  'users',
  {
    readKeys: text('readKeys').notNull().default('{}'),
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    emailNormalized: text('emailNormalized').notNull(),
    displayEmail: text('displayEmail').notNull(),
    title: text('title').notNull(),
    avatarColor: text('avatarColor').notNull(),
    timezone: text('timezone').notNull(),
    ...timestamps(),
    ...mutable(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check('users_readKeys', sql`json_valid(${t.readKeys})`),
    uniqueIndex('users_email').on(t.emailNormalized),
    check('users_version', sql`${t.version} > 0`),
  ],
);

export const authIdentities = sqliteTable(
  'authIdentities',
  {
    id: text('id').primaryKey(),
    providerKey: text('providerKey').notNull(),
    tenant: text('tenant').notNull(),
    subject: text('subject').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => users.id),
    createdAt: integer('createdAt').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('authIdentities_external').on(t.providerKey, t.tenant, t.subject),
    uniqueIndex('authIdentities_id_user').on(t.id, t.userId),
    check('authIdentities_provider', sql`${t.providerKey} = 'ict24h-identity'`),
  ],
);

export const authSessions = sqliteTable(
  'authSessions',
  {
    id: text('id').primaryKey(),
    sidHash: text('sidHash').notNull(),
    identityId: text('identityId').notNull(),
    userId: text('userId').notNull(),
    accessCiphertext: text('accessCiphertext'),
    refreshCiphertext: text('refreshCiphertext'),
    accessExpiresAt: integer('accessExpiresAt').notNull(),
    refreshExpiresAt: integer('refreshExpiresAt').notNull(),
    expiresAt: integer('expiresAt').notNull(),
    tokenVersion: integer('tokenVersion').notNull(),
    authGeneration: integer('authGeneration').notNull(),
    createdAt: integer('createdAt').notNull(),
    revokedAt: integer('revokedAt'),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('authSessions_sidHash').on(t.sidHash),
    index('authSessions_expiry').on(t.expiresAt, t.id),
    foreignKey({
      columns: [t.identityId, t.userId],
      foreignColumns: [authIdentities.id, authIdentities.userId],
    }),
    check('authSessions_version', sql`${t.tokenVersion} > 0 AND ${t.authGeneration} > 0`),
    check(
      'authSessions_credential_state',
      sql`(${t.revokedAt} IS NULL AND ${t.accessCiphertext} IS NOT NULL AND ${t.refreshCiphertext} IS NOT NULL) OR (${t.revokedAt} IS NOT NULL AND ${t.accessCiphertext} IS NULL AND ${t.refreshCiphertext} IS NULL)`,
    ),
  ],
);

export const oidcIdentityLinks = sqliteTable(
  'oidcIdentityLinks',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('active'),
    createdAt: integer('createdAt').notNull(),
    createdBy: text('createdBy').notNull(),
    migrationBatchId: text('migrationBatchId').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('oidcIdentityLinks_external').on(t.issuer, t.subject),
    uniqueIndex('oidcIdentityLinks_user_issuer').on(t.issuer, t.userId),
    uniqueIndex('oidcIdentityLinks_binding').on(t.id, t.userId, t.issuer, t.subject),
    check('oidcIdentityLinks_status', sql`${t.status} IN ('active','revoked')`),
    check('oidcIdentityLinks_subject', sql`length(${t.subject}) BETWEEN 1 AND 255`),
    check('oidcIdentityLinks_revision', sql`${t.revision}>0`),
  ],
);
export const oidcAppSessions = sqliteTable(
  'oidcAppSessions',
  {
    id: text('id').primaryKey(),
    sidHash: text('sidHash').notNull(),
    linkId: text('linkId').notNull(),
    userId: text('userId').notNull(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    clientId: text('clientId').notNull(),
    providerSid: text('providerSid').notNull(),
    bundle: text('bundle').notNull(),
    createdAt: integer('createdAt').notNull(),
    expiresAt: integer('expiresAt').notNull(),
    authorityValidatedAt: integer('authorityValidatedAt').notNull(),
    accessExpiresAt: integer('accessExpiresAt').notNull(),
    revokedAt: integer('revokedAt'),
    revision: integer('revision').notNull().default(1),
    leaseOwner: text('leaseOwner'),
    leaseUntil: integer('leaseUntil').notNull().default(0),
    refreshInput: text('refreshInput'),
    refreshAttemptAt: integer('refreshAttemptAt').notNull().default(0),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('oidcAppSessions_sidHash').on(t.sidHash),
    index('oidcAppSessions_expiry').on(t.expiresAt, t.id),
    foreignKey({
      columns: [t.linkId, t.userId, t.issuer, t.subject],
      foreignColumns: [
        oidcIdentityLinks.id,
        oidcIdentityLinks.userId,
        oidcIdentityLinks.issuer,
        oidcIdentityLinks.subject,
      ],
    }),
    check(
      'oidcAppSessions_lifetime',
      sql`${t.expiresAt}=${t.createdAt}+28800000 AND ${t.revision}>0`,
    ),
    check(
      'oidcAppSessions_refresh',
      sql`(${t.refreshInput} IS NULL AND ${t.refreshAttemptAt}=0) OR (${t.refreshInput} IS NOT NULL AND ${t.refreshAttemptAt}>0)`,
    ),
  ],
);

export const oidcLoginTransactions = sqliteTable(
  'oidcLoginTransactions',
  {
    id: text('id').primaryKey(),
    stateHash: text('stateHash').notNull(),
    bindingHash: text('bindingHash').notNull(),
    secret: text('secret').notNull(),
    issuer: text('issuer').notNull(),
    clientId: text('clientId').notNull(),
    redirectUri: text('redirectUri').notNull(),
    returnTo: text('returnTo').notNull(),
    priorHash: text('priorHash'),
    createdAt: integer('createdAt').notNull(),
    expiresAt: integer('expiresAt').notNull(),
    status: text('status').notNull().default('pending'),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('oidcLoginTransactions_state').on(t.stateHash),
    index('oidcLoginTransactions_expiry').on(t.expiresAt),
    check(
      'oidcLoginTransactions_status',
      sql`${t.status} IN ('pending','claimed','succeeded','failed')`,
    ),
    check('oidcLoginTransactions_lifetime', sql`${t.expiresAt}=${t.createdAt}+600000`),
  ],
);
export const oidcLogoutTransactions = sqliteTable(
  'oidcLogoutTransactions',
  {
    stateHash: text('stateHash').primaryKey(),
    bindingHash: text('bindingHash').notNull(),
    expiresAt: integer('expiresAt').notNull(),
    consumedAt: integer('consumedAt'),
  },
  (t): SQLiteTableExtraConfigValue[] => [index('oidcLogoutTransactions_expiry').on(t.expiresAt)],
);

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    iconColor: text('iconColor').notNull(),
    brand: integer('brand', { mode: 'boolean' }).notNull(),
    timezone: text('timezone').notNull(),
    planLabel: text('planLabel'),
    ...timestamps(),
    ...mutable(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('workspaces_slug').on(t.slug),
    check('workspaces_brand', sql`${t.brand} IN (0,1)`),
    check('workspaces_version', sql`${t.version} > 0`),
  ],
);

export const workspaceMembers = sqliteTable(
  'workspaceMembers',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    userId: text('userId')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull(),
    status: text('status').notNull(),
    teamId: text('teamId').references((): AnySQLiteColumn => teams.id),
    lastSeenAt: integer('lastSeenAt'),
    removedAt: integer('removedAt'),
    ...timestamps(),
    ...mutable(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('workspaceMembers_workspace_id').on(t.workspaceId, t.id),
    uniqueIndex('members_workspace_user').on(t.workspaceId, t.userId),
    index('members_team').on(t.workspaceId, t.teamId, t.id),
    check('role_enum', sql`${t.role} IN ('Owner','Admin','Member','Guest')`),
    check('status_enum', sql`${t.status} IN ('active','invited')`),
    foreignKey({
      columns: [t.workspaceId, t.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    check('workspaceMembers_version', sql`${t.version} > 0`),
  ],
);

export const teams = sqliteTable(
  'teams',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    nameNormalized: text('nameNormalized').notNull(),
    description: text('description').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    ...timestamps(),
    ...tombstone(),
    ...mutable(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('teams_workspace_id').on(t.workspaceId, t.id),
    uniqueIndex('teams_active_name')
      .on(t.workspaceId, t.nameNormalized)
      .where(sql`${t.deletedAt} IS NULL`),
    check('teams_tombstone', sql`(${t.deletedAt} IS NULL) = (${t.deletedBy} IS NULL)`),
    foreignKey({
      columns: [t.workspaceId, t.deletedBy],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    check('teams_version', sql`${t.version} > 0`),
  ],
);

export const projects = sqliteTable(
  'projects',
  {
    readKeys: text('readKeys').notNull().default('{}'),
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    key: text('key').notNull(),
    taskSequence: integer('taskSequence').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    status: text('status').notNull(),
    teamId: text('teamId'),
    leadId: text('leadId').notNull(),
    startDate: text('startDate'),
    dueDate: text('dueDate'),
    visibility: text('visibility').notNull(),
    lastActivityAt: integer('lastActivityAt').notNull(),
    ...timestamps(),
    archivedAt: integer('archivedAt'),
    ...tombstone(),
    ...mutable(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check('projects_readKeys', sql`json_valid(${t.readKeys})`),
    index('projects_catalog_name')
      .on(t.workspaceId, t.deletedAt, sql`(${t.readKeys} ->> '$.name.locale')`, t.id)
      .where(sql`${t.archivedAt} IS NULL OR ${t.archivedAt}=0`),
    uniqueIndex('projects_workspace_id').on(t.workspaceId, t.id),
    uniqueIndex('projects_key').on(t.workspaceId, t.key),
    index('projects_navigation').on(
      t.workspaceId,
      t.archivedAt,
      t.deletedAt,
      t.lastActivityAt,
      t.id,
    ),
    index('projects_team').on(t.workspaceId, t.teamId, t.id),
    check('status_enum', sql`${t.status} IN ('planning','active','risk','hold','complete')`),
    check('visibility_enum', sql`${t.visibility} IN ('workspace','private')`),
    check(
      'projects_dates',
      sql`${t.startDate} IS NULL OR ${t.dueDate} IS NULL OR ${t.startDate} <= ${t.dueDate}`,
    ),
    check('projects_sequence', sql`${t.taskSequence} >= 0`),
    foreignKey({
      columns: [t.workspaceId, t.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    check('projects_tombstone', sql`(${t.deletedAt} IS NULL) = (${t.deletedBy} IS NULL)`),
    foreignKey({
      columns: [t.workspaceId, t.deletedBy],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    check('projects_version', sql`${t.version} > 0`),
  ],
);

export const commandUndoRecords = sqliteTable(
  'commandUndoRecords',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    actorMemberId: text('actorMemberId').notNull(),
    kind: text('kind').notNull(),
    payloadVersion: integer('payloadVersion').notNull(),
    payloadJson: text('payloadJson').notNull(),
    createdAt: integer('createdAt').notNull(),
    consumedAt: integer('consumedAt'),
    resultJson: text('resultJson'),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('commandUndoRecords_workspace_id').on(t.workspaceId, t.id),
    index('undo_actor').on(t.workspaceId, t.actorMemberId, t.id),
    check(
      'kind_enum',
      sql`${t.kind} IN ('task.complete','task.archive','task.delete','project.archive','project.delete','comment.delete','file.delete','tasks.bulkDelete','tasks.completeColumn','tasks.archiveCompletedColumn','team.delete')`,
    ),
    check(
      'undo_payload',
      sql`${t.payloadVersion} = 1 AND json_valid(${t.payloadJson}) AND length(CAST(${t.payloadJson} AS BLOB)) <= 65536 AND coalesce(json_type(${t.payloadJson}, '$.targets'), '') = 'array' AND coalesce(json_array_length(${t.payloadJson}, '$.targets'), -1) BETWEEN CASE WHEN ${t.kind} = 'tasks.archiveCompletedColumn' THEN 0 ELSE 1 END AND 128 AND coalesce(json_extract(${t.payloadJson}, '$.kind'), '') = ${t.kind}`,
    ),
    check('undo_consumed', sql`(${t.consumedAt} IS NULL) = (${t.resultJson} IS NULL)`),
    check('undo_result', sql`${t.resultJson} IS NULL OR json_valid(${t.resultJson})`),
    foreignKey({
      columns: [t.workspaceId, t.actorMemberId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
  ],
);

export const tasks = sqliteTable(
  'tasks',
  {
    readKeys: text('readKeys').notNull().default('{}'),
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    projectId: text('projectId').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    descriptionHtml: text('descriptionHtml').notNull(),
    descriptionText: text('descriptionText').notNull(),
    status: text('status').notNull(),
    priority: text('priority').notNull(),
    assigneeId: text('assigneeId'),
    startDate: text('startDate'),
    dueDate: text('dueDate'),
    estimate: text('estimate'),
    recurrence: text('recurrence'),
    position: integer('position').notNull(),
    completedAt: integer('completedAt'),
    previousStatus: text('previousStatus'),
    recurrenceSourceTaskId: text('recurrenceSourceTaskId').references(
      (): AnySQLiteColumn => tasks.id,
    ),
    cancelledByUndoId: text('cancelledByUndoId'),
    createdBy: text('createdBy').notNull(),
    createRequestId: text('createRequestId'),
    createRequestHash: text('createRequestHash'),
    ...timestamps(),
    archivedAt: integer('archivedAt'),
    ...tombstone(),
    ...mutable(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check('tasks_readKeys', sql`json_valid(${t.readKeys})`),
    index('tasks_active_manual').on(t.workspaceId, t.deletedAt, t.archivedAt, t.position, t.id),
    index('tasks_active_title').on(
      t.workspaceId,
      t.deletedAt,
      t.archivedAt,
      sql`(${t.readKeys} ->> '$.title.foldedUtf16')`,
      t.id,
    ),
    uniqueIndex('tasks_workspace_id').on(t.workspaceId, t.id),
    uniqueIndex('tasks_number').on(t.projectId, t.number),
    uniqueIndex('tasks_recurrence').on(t.workspaceId, t.recurrenceSourceTaskId),
    uniqueIndex('tasks_create_request').on(t.workspaceId, t.createdBy, t.createRequestId),
    index('tasks_project').on(
      t.workspaceId,
      t.projectId,
      t.archivedAt,
      t.deletedAt,
      t.position,
      t.id,
    ),
    index('tasks_assignee').on(
      t.workspaceId,
      t.assigneeId,
      t.archivedAt,
      t.deletedAt,
      t.dueDate,
      t.id,
    ),
    index('tasks_due').on(t.workspaceId, t.dueDate, t.id),
    check('status_enum', sql`${t.status} IN ('backlog','todo','progress','review','done')`),
    check('priority_enum', sql`${t.priority} IN ('urgent','high','medium','low','none')`),
    check(
      'tasks_dates',
      sql`${t.startDate} IS NULL OR ${t.dueDate} IS NULL OR ${t.startDate} <= ${t.dueDate}`,
    ),
    check('tasks_completed', sql`(${t.status} = 'done') = (${t.completedAt} IS NOT NULL)`),
    check('tasks_request', sql`(${t.createRequestId} IS NULL) = (${t.createRequestHash} IS NULL)`),
    check(
      'tasks_cancelled',
      sql`${t.cancelledByUndoId} IS NULL OR (${t.deletedAt} IS NOT NULL AND ${t.deletedBy} IS NOT NULL AND ${t.recurrenceSourceTaskId} IS NULL)`,
    ),
    check('recurrence_enum', sql`${t.recurrence} IN ('daily','weekly','biweekly','monthly')`),
    check('estimate_enum', sql`${t.estimate} IN ('30m','1h','2h','4h','1d','2d','3d','5d','8d')`),
    check(
      'previousStatus_enum',
      sql`${t.previousStatus} IN ('backlog','todo','progress','review','done')`,
    ),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.assigneeId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.createdBy],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.recurrenceSourceTaskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.cancelledByUndoId],
      foreignColumns: [commandUndoRecords.workspaceId, commandUndoRecords.id],
    }),
    check('tasks_tombstone', sql`(${t.deletedAt} IS NULL) = (${t.deletedBy} IS NULL)`),
    foreignKey({
      columns: [t.workspaceId, t.deletedBy],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    check('tasks_version', sql`${t.version} > 0`),
  ],
);

export const subtasks = sqliteTable(
  'subtasks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    taskId: text('taskId').notNull(),
    title: text('title').notNull(),
    done: integer('done', { mode: 'boolean' }).notNull(),
    assigneeId: text('assigneeId'),
    dueDate: text('dueDate'),
    note: text('note').notNull(),
    position: integer('position').notNull(),
    ...timestamps(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('subtasks_workspace_id').on(t.workspaceId, t.id),
    check('subtasks_done', sql`${t.done} IN (0,1)`),
    index('subtasks_task').on(t.workspaceId, t.taskId, t.position, t.id),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.assigneeId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
  ],
);

export const projectMembers = sqliteTable(
  'projectMembers',
  {
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    projectId: text('projectId').notNull(),
    memberId: text('memberId').notNull(),
    permission: text('permission').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    primaryKey({ columns: [t.projectId, t.memberId] }),
    check('permission_enum', sql`${t.permission} IN ('edit','view')`),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
  ],
);

export const taskLabels = sqliteTable(
  'taskLabels',
  {
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    taskId: text('taskId').notNull(),
    labelId: text('labelId').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    primaryKey({ columns: [t.taskId, t.labelId] }),
    check(
      'labelId_enum',
      sql`${t.labelId} IN ('design','frontend','backend','research','content','bug','qa','growth')`,
    ),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
  ],
);

export const taskDependencies = sqliteTable(
  'taskDependencies',
  {
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    taskId: text('taskId').notNull(),
    dependsOnTaskId: text('dependsOnTaskId').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    primaryKey({ columns: [t.taskId, t.dependsOnTaskId] }),
    check('dependency_self', sql`${t.taskId} != ${t.dependsOnTaskId}`),
    index('dependency_incoming').on(t.workspaceId, t.dependsOnTaskId, t.taskId),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.dependsOnTaskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
  ],
);

export const taskFavorites = sqliteTable(
  'taskFavorites',
  {
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    memberId: text('memberId').notNull(),
    taskId: text('taskId').notNull(),
    createdAt: integer('createdAt').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    primaryKey({ columns: [t.memberId, t.taskId] }),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
  ],
);

export const projectFavorites = sqliteTable(
  'projectFavorites',
  {
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    memberId: text('memberId').notNull(),
    projectId: text('projectId').notNull(),
    createdAt: integer('createdAt').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    primaryKey({ columns: [t.memberId, t.projectId] }),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
  ],
);

export const memberProjectOrder = sqliteTable(
  'memberProjectOrder',
  {
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    memberId: text('memberId').notNull(),
    projectId: text('projectId').notNull(),
    position: integer('position').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    primaryKey({ columns: [t.memberId, t.projectId] }),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
  ],
);

export const commentReactions = sqliteTable(
  'commentReactions',
  {
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    commentId: text('commentId').notNull(),
    memberId: text('memberId').notNull(),
    reactionKey: text('reactionKey').notNull(),
    createdAt: integer('createdAt').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    primaryKey({ columns: [t.commentId, t.memberId, t.reactionKey] }),
    check('reactionKey_enum', sql`${t.reactionKey} IN ('👍','🎉','❤️','👀','🚀','✅')`),
    foreignKey({
      columns: [t.workspaceId, t.commentId],
      foreignColumns: [comments.workspaceId, comments.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
  ],
);

export const comments = sqliteTable(
  'comments',
  {
    readKeys: text('readKeys').notNull().default('{}'),
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    taskId: text('taskId').notNull(),
    authorId: text('authorId').notNull(),
    bodyText: text('bodyText').notNull(),
    mentionedMemberIdsJson: text('mentionedMemberIdsJson', { mode: 'json' })
      .$type<string[]>()
      .notNull(),
    ...timestamps(),
    ...tombstone(),
    ...mutable(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    index('comments_visible_history').on(t.workspaceId, t.taskId, t.deletedAt, t.createdAt, t.id),
    check('comments_readKeys', sql`json_valid(${t.readKeys})`),
    uniqueIndex('comments_workspace_id').on(t.workspaceId, t.id),
    index('comments_task').on(t.workspaceId, t.taskId, t.createdAt, t.id),
    check(
      'comments_mentions',
      sql`json_valid(${t.mentionedMemberIdsJson}) AND json_type(${t.mentionedMemberIdsJson}) = 'array'`,
    ),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.authorId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    check('comments_tombstone', sql`(${t.deletedAt} IS NULL) = (${t.deletedBy} IS NULL)`),
    foreignKey({
      columns: [t.workspaceId, t.deletedBy],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    check('comments_version', sql`${t.version} > 0`),
  ],
);

export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    projectId: text('projectId'),
    taskId: text('taskId'),
    actorId: text('actorId'),
    eventType: text('eventType').notNull(),
    payloadJson: text('payloadJson').notNull(),
    commandId: text('commandId'),
    revertedAt: integer('revertedAt'),
    createdAt: integer('createdAt').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    index('activity_visible_history').on(t.workspaceId, t.revertedAt, t.createdAt, t.id),
    uniqueIndex('activity_workspace_id').on(t.workspaceId, t.id),
    index('activity_project').on(t.workspaceId, t.projectId, t.createdAt, t.id),
    index('activity_task').on(t.workspaceId, t.taskId, t.createdAt, t.id),
    check('activity_payload', sql`json_valid(${t.payloadJson})`),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.actorId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
  ],
);

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    recipientId: text('recipientId').notNull(),
    actorId: text('actorId'),
    projectId: text('projectId'),
    taskId: text('taskId'),
    type: text('type').notNull(),
    text: text('text').notNull(),
    snippet: text('snippet').notNull(),
    createdAt: integer('createdAt').notNull(),
    readAt: integer('readAt'),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    index('notifications_recipient_history').on(t.workspaceId, t.recipientId, t.createdAt, t.id),
    uniqueIndex('notifications_workspace_id').on(t.workspaceId, t.id),
    index('notifications_recipient').on(t.workspaceId, t.recipientId, t.readAt, t.createdAt, t.id),
    check('type_enum', sql`${t.type} IN ('mention','assign','comment','due','update')`),
    foreignKey({
      columns: [t.workspaceId, t.recipientId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.actorId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
  ],
);

export const savedViews = sqliteTable(
  'savedViews',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    projectId: text('projectId').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    filtersJson: text('filtersJson', { mode: 'json' }).notNull(),
    createdBy: text('createdBy').notNull(),
    position: integer('position').notNull(),
    ...timestamps(),
    ...mutable(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('savedViews_workspace_id').on(t.workspaceId, t.id),
    index('savedViews_project').on(t.workspaceId, t.projectId, t.position, t.id),
    check('type_enum', sql`${t.type} IN ('list','board','table')`),
    check('views_filters', sql`json_valid(${t.filtersJson})`),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.createdBy],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    check('savedViews_version', sql`${t.version} > 0`),
  ],
);

export const memberPreferences = sqliteTable(
  'memberPreferences',
  {
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    memberId: text('memberId').notNull(),
    preferencesJson: text('preferencesJson', { mode: 'json' }).notNull(),
    notificationPreferencesJson: text('notificationPreferencesJson', { mode: 'json' }).notNull(),
    updatedAt: integer('updatedAt').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    primaryKey({ columns: [t.memberId] }),
    check(
      'preferences_json',
      sql`json_valid(${t.preferencesJson}) AND json_valid(${t.notificationPreferencesJson})`,
    ),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
  ],
);

export const files = sqliteTable(
  'files',
  {
    readKeys: text('readKeys').notNull().default('{}'),
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    projectId: text('projectId').notNull(),
    taskId: text('taskId'),
    name: text('name').notNull(),
    fileType: text('fileType').notNull(),
    mimeType: text('mimeType'),
    sizeBytes: integer('sizeBytes'),
    displaySize: text('displaySize').notNull(),
    storageMode: text('storageMode').notNull(),
    objectKey: text('objectKey'),
    contentSha256: text('contentSha256'),
    uploadRequestId: text('uploadRequestId'),
    uploadRequestHash: text('uploadRequestHash'),
    createdBy: text('createdBy').notNull(),
    ...timestamps(),
    ...tombstone(),
    ...mutable(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    index('files_page_name').on(
      t.workspaceId,
      t.projectId,
      t.deletedAt,
      sql`(${t.readKeys} ->> '$.name.locale')`,
      t.id,
    ),
    index('files_page_type').on(
      t.workspaceId,
      t.projectId,
      t.deletedAt,
      sql`(${t.readKeys} ->> '$.fileType.locale')`,
      t.id,
    ),
    index('files_page_recent').on(
      t.workspaceId,
      t.projectId,
      t.deletedAt,
      sql`(-${t.createdAt})`,
      t.id,
    ),
    index('files_page_size').on(
      t.workspaceId,
      t.projectId,
      t.deletedAt,
      sql`(CASE WHEN ${t.sizeBytes} IS NULL THEN 1 ELSE -${t.sizeBytes} END)`,
      t.id,
    ),

    check('files_readKeys', sql`json_valid(${t.readKeys})`),
    uniqueIndex('files_workspace_id').on(t.workspaceId, t.id),
    uniqueIndex('files_upload_request').on(t.workspaceId, t.createdBy, t.uploadRequestId),
    index('files_project').on(t.workspaceId, t.projectId, t.deletedAt, t.createdAt, t.id),
    check('storageMode_enum', sql`${t.storageMode} IN ('sample','r2')`),
    check('files_request', sql`(${t.uploadRequestId} IS NULL) = (${t.uploadRequestHash} IS NULL)`),
    check(
      'files_r2',
      sql`${t.storageMode} != 'r2' OR (${t.objectKey} IS NOT NULL AND ${t.contentSha256} IS NOT NULL AND ${t.mimeType} IS NOT NULL AND ${t.sizeBytes} IS NOT NULL AND ${t.sizeBytes} BETWEEN 0 AND 10485760)`,
    ),
    check('files_size', sql`${t.sizeBytes} IS NULL OR ${t.sizeBytes} >= 0`),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.createdBy],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    check('files_tombstone', sql`(${t.deletedAt} IS NULL) = (${t.deletedBy} IS NULL)`),
    foreignKey({
      columns: [t.workspaceId, t.deletedBy],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }),
    check('files_version', sql`${t.version} > 0`),
  ],
);

export const calendarEvents = sqliteTable(
  'calendarEvents',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    projectId: text('projectId').notNull(),
    title: text('title').notNull(),
    date: text('date').notNull(),
    localTime: text('localTime').notNull(),
    timezone: text('timezone').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('calendarEvents_workspace_id').on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
  ],
);

export const projectMilestones = sqliteTable(
  'projectMilestones',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspaceId')
      .notNull()
      .references(() => workspaces.id),
    projectId: text('projectId').notNull(),
    name: text('name').notNull(),
    date: text('date').notNull(),
    position: integer('position').notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    uniqueIndex('projectMilestones_workspace_id').on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
  ],
);
