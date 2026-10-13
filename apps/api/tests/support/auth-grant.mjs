// Trusted fixture setup only; no production provisioning route or identity call.
export function activeMemberGrant({ memberId, workspaceId, userId, sourceMemberId, now }) {
  return [
    {
      sql: `INSERT INTO workspaceMembers(id,workspaceId,userId,role,status,createdAt,updatedAt,version)
      SELECT ?,?,?,'Member','active',?,?,1 WHERE EXISTS(SELECT 1 FROM memberPreferences WHERE workspaceId=? AND memberId=?)`,
      parameters: [memberId, workspaceId, userId, now, now, workspaceId, sourceMemberId],
    },
    {
      sql: `INSERT INTO memberPreferences(workspaceId,memberId,preferencesJson,notificationPreferencesJson,updatedAt)
      SELECT workspaceId,?,preferencesJson,notificationPreferencesJson,? FROM memberPreferences
      WHERE workspaceId=? AND memberId=? AND EXISTS(SELECT 1 FROM workspaceMembers WHERE workspaceId=? AND id=?)`,
      parameters: [memberId, now, workspaceId, sourceMemberId, workspaceId, memberId],
    },
  ];
}
