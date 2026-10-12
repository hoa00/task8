import { withReadKeys } from '../../scripts/read-keys.mjs';
const day = 86400000;
export const readNames = [
  'a',
  'ä',
  'B',
  'z',
  'é',
  'e\u0301',
  'Änne',
  'Kelvin',
  'İSTANBUL',
  'A%_B',
  'A\\B',
  '𐀀',
  '\ue000',
  '1',
  '10',
  'Infinity',
  'Đà Nẵng',
  '東京',
];
const uid = (side, kind, index) =>
  `019a7777-${String(side).padStart(4, '0')}-700${kind}-8000-${String(index + 1).padStart(12, '0')}`;
const literal = (value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : "'" + String(value).replaceAll("'", "''") + "'";
function insert(table, source) {
  const row = withReadKeys(table, source);
  return `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`;
}
export function readFixtureSql(seed, now) {
  const statements = [],
    scopes = [];
  for (const [side, data, identity] of [
    [1, seed.rows, seed.primary],
    [2, seed.secondary, seed.isolation],
  ]) {
    const project = data.projects.find(
        (p) => p.visibility === 'workspace' && p.archivedAt === null && p.deletedAt == null,
      ),
      actor = data.workspaceMembers.find((m) => m.id === identity.memberId),
      baseTask = data.tasks.find(
        (t) => t.projectId === project.id && t.deletedAt == null && t.archivedAt === null,
      );
    if (!project || !actor || !baseTask) throw new Error('Missing read fixture scope');
    const memberIds = [],
      taskIds = [],
      projectIds = [],
      fileIds = [],
      commentIds = [];
    for (let index = 0; index < 90; index++) {
      const userId = uid(side, 1, index),
        memberId = uid(side, 2, index);
      memberIds.push(memberId);
      statements.push(
        insert('users', {
          ...data.users[0],
          id: userId,
          name: readNames[index % readNames.length],
          displayEmail: `query-${side}-${index}@example.test`,
          emailNormalized: `query-${side}-${index}@example.test`,
          title: index % 2 ? 'Ā %_ title' : 'Query title',
          version: 1,
        }),
      );
      statements.push(
        insert('workspaceMembers', {
          ...actor,
          id: memberId,
          userId,
          status: index % 3 ? 'active' : 'invited',
          role: 'Member',
          removedAt: null,
          version: 1,
        }),
      );
    }
    for (let index = 0; index < 90; index++) {
      const id = uid(side, 3, index);
      projectIds.push(id);
      statements.push(
        insert('projects', {
          ...project,
          id,
          key: `Q${side}${index}`,
          name: readNames[index % readNames.length],
          description: index % 2 ? 'Ä %_ catalogue' : 'Test catalogue',
          taskSequence: 0,
          dueDate: index % 3 ? '2026-10-20' : null,
          startDate: null,
          visibility: index % 4 ? 'workspace' : 'private',
          archivedAt: index === 31 ? 0 : index % 13 === 0 ? now - day : null,
          createdAt: now - 10 * day,
          updatedAt: now - day,
          lastActivityAt: now - (index % 5) * day,
          version: 1,
        }),
      );
    }
    statements.push(`UPDATE projects SET taskSequence=30000 WHERE id=${literal(project.id)};`);
    for (let index = 0; index < 230; index++) {
      const id = uid(side, 4, index);
      taskIds.push(id);
      const status = ['backlog', 'todo', 'progress', 'review', 'done'][index % 5],
        priority = ['urgent', 'high', 'medium', 'low', 'none'][index % 5];
      statements.push(
        insert('tasks', {
          ...baseTask,
          id,
          workspaceId: identity.workspaceId,
          projectId: project.id,
          number: 10000 + index,
          title: readNames[index % readNames.length],
          descriptionHtml: '',
          descriptionText: index % 3 ? 'Literal %_ Ä search' : 'Text',
          status,
          priority,
          assigneeId: index % 4 ? memberIds[index % memberIds.length] : null,
          startDate: index % 4 ? '2026-10-10' : null,
          dueDate: index % 3 ? '2026-10-20' : null,
          estimate: index % 4 ? '1h' : null,
          position: (index % 7) * 100,
          recurrence: null,
          recurrenceSourceTaskId: null,
          cancelledByUndoId: null,
          createRequestId: null,
          createRequestHash: null,
          createdBy: identity.memberId,
          createdAt: now - (index % 20) * day - 2 * 3600000,
          updatedAt: now - (index % 9) * day - 2 * 3600000,
          completedAt: status === 'done' ? now - (index % 9) * day : null,
          previousStatus: null,
          archivedAt: index % 17 === 0 ? now - day : null,
          deletedAt: null,
          deletedBy: null,
          lastMutationId: null,
          version: 1,
        }),
      );
      if (index % 3 === 0)
        statements.push(
          insert('taskLabels', {
            workspaceId: identity.workspaceId,
            taskId: id,
            labelId: 'design',
          }),
        );
      if (index % 4 === 0)
        statements.push(
          insert('taskFavorites', {
            workspaceId: identity.workspaceId,
            taskId: id,
            memberId: identity.memberId,
            createdAt: now,
          }),
        );
    }
    for (let index = 0; index < 90; index++) {
      const fileId = uid(side, 5, index),
        commentId = uid(side, 6, index);
      fileIds.push(fileId);
      commentIds.push(commentId);
      statements.push(
        insert('files', {
          ...data.files[0],
          id: fileId,
          workspaceId: identity.workspaceId,
          projectId: project.id,
          taskId: index % 3 ? baseTask.id : null,
          name: readNames[index % readNames.length],
          fileType: index % 2 ? 'PDF' : 'PNG',
          storageMode: 'sample',
          objectKey: null,
          contentSha256: null,
          uploadRequestId: null,
          uploadRequestHash: null,
          mimeType: null,
          sizeBytes: index % 4 ? index * 1024 : null,
          displaySize: 'Sample',
          createdBy: identity.memberId,
          createdAt: now - (index % 5) * day,
          updatedAt: now,
          deletedAt: null,
          deletedBy: null,
          lastMutationId: null,
          version: 1,
        }),
      );
      statements.push(
        insert('comments', {
          ...data.comments[0],
          id: commentId,
          workspaceId: identity.workspaceId,
          taskId: baseTask.id,
          authorId: identity.memberId,
          bodyText: readNames[index % readNames.length] + ' comment',
          mentionedMemberIdsJson: '[]',
          createdAt: now - (index % 5) * day,
          updatedAt: now,
          deletedAt: null,
          deletedBy: null,
          version: 1,
        }),
      );
      const activity = {
        ...data.activity[0],
        id: uid(side, 7, index),
        workspaceId: identity.workspaceId,
        projectId: project.id,
        taskId: baseTask.id,
        actorId: identity.memberId,
        commandId: null,
        revertedAt: null,
        createdAt: now - (index % 5) * day,
      };
      statements.push(insert('activity', activity));
      statements.push(
        insert('notifications', {
          ...data.notifications[0],
          id: uid(side, 8, index),
          workspaceId: identity.workspaceId,
          projectId: project.id,
          taskId: baseTask.id,
          recipientId: identity.memberId,
          actorId: identity.memberId,
          type: ['mention', 'assign', 'comment', 'update'][index % 4],
          text: 'Read fixture',
          snippet: '%_ Ä',
          createdAt: now - (index % 5) * day,
          readAt: index % 3 === 0 ? now : null,
        }),
      );
    }
    scopes.push({
      ...identity,
      projectId: project.id,
      teamId: actor.teamId ?? data.teams[0].id,
      taskId: baseTask.id,
      memberIds,
      taskIds,
      projectIds,
      fileIds,
      commentIds,
    });
  }
  return { sql: statements.join('\n'), scopes };
}
