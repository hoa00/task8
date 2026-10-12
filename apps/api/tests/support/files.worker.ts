// Finite local-only fault injection; production imports no test entry.
import app from '../../src/index.ts';
let observation: unknown = null;
let undoPending: string | null = null;
const snapshot = async (db: D1Database) => {
  const rows: Record<string, unknown> = {};
  for (const table of [
    'users',
    'workspaces',
    'workspaceMembers',
    'teams',
    'projects',
    'projectMembers',
    'tasks',
    'subtasks',
    'taskLabels',
    'taskDependencies',
    'comments',
    'commentReactions',
    'files',
    'activity',
    'notifications',
    'savedViews',
    'taskFavorites',
    'projectFavorites',
    'memberProjectOrder',
    'memberPreferences',
    'calendarEvents',
    'projectMilestones',
    'commandUndoRecords',
    'd1_migrations',
  ])
    rows[table] = (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
  return rows;
};
let pending: (() => Promise<unknown>) | null = null;
const barriers = new Map<string, { count: number; promise: Promise<void>; release: () => void }>();
export default {
  async fetch(request: Request, env: CloudflareBindings, context: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (path === '/__wu35/undo-pending') return Response.json({ undoId: undoPending });
    if (path === '/__wu35/observation') return Response.json(observation);
    if (path === '/__wu35/sql') {
      const input = (await request.json()) as { sql: string; parameters?: unknown[] };
      return Response.json(
        await env.DB.prepare(input.sql)
          .bind(...(input.parameters ?? []))
          .all(),
      );
    }
    if (path === '/__wu35/remove-object') {
      const { key } = (await request.json()) as { key: string };
      await env.FILES.delete(key);
      return Response.json({ removed: key });
    }
    if (path === '/__wu35/snapshot') {
      const rows: Record<string, unknown> = {};
      for (const table of [
        'users',
        'workspaces',
        'workspaceMembers',
        'teams',
        'projects',
        'projectMembers',
        'tasks',
        'subtasks',
        'taskLabels',
        'taskDependencies',
        'comments',
        'commentReactions',
        'files',
        'activity',
        'notifications',
        'savedViews',
        'taskFavorites',
        'projectFavorites',
        'memberProjectOrder',
        'memberPreferences',
        'calendarEvents',
        'projectMilestones',
        'commandUndoRecords',
        'd1_migrations',
      ])
        rows[table] = (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
      return Response.json({ rows });
    }
    if (path === '/__wu35/objects') {
      const objects = await env.FILES.list();
      return Response.json({
        objects: objects.objects.map((o) => ({ key: o.key, size: o.size, etag: o.etag })),
      });
    }
    if (path === '/__wu35/flush') {
      const write = pending;
      pending = null;
      return Response.json({ completed: write ? await write() : null });
    }
    const fault = request.headers.get('x-wu35-test'),
      barrier = request.headers.get('x-wu35-barrier');
    let after = false,
      queries = 0,
      maxParameters = 0;
    const state: { priorGrant: { visibility: string; permission: string } | null } = {
      priorGrant: null,
    };
    const DB = new Proxy(env.DB, {
      get(target, key) {
        if (key === 'prepare')
          return (sql: string) => {
            queries++;
            const statement = target.prepare(sql);
            return new Proxy(statement, {
              get(prepared, field) {
                if (field === 'bind')
                  return (...params: unknown[]) => {
                    maxParameters = Math.max(maxParameters, params.length);
                    const bound = prepared.bind(...params);
                    return new Proxy(bound, {
                      get(stmt, prop) {
                        if (
                          prop === 'all' &&
                          after &&
                          fault === 'ack-readfail' &&
                          (sql.includes('FROM files f WHERE workspaceId=?') ||
                            sql.startsWith('SELECT * FROM files WHERE workspaceId=?'))
                        )
                          return () => Promise.reject(new Error('lost read acknowledgement'));
                        const value = Reflect.get(stmt, prop, stmt);
                        return typeof value === 'function' ? value.bind(stmt) : value;
                      },
                    });
                  };
                const value = Reflect.get(prepared, field, prepared);
                return typeof value === 'function' ? value.bind(prepared) : value;
              },
            });
          };
        if (key === 'batch')
          return async (statements: D1PreparedStatement[]) => {
            if (fault === 'rollback' || fault === 'cleanup-rollback')
              statements.splice(
                1,
                0,
                target.prepare(
                  "INSERT INTO workspaceMembers(id,workspaceId,userId,role,status,createdAt,updatedAt,version) VALUES ('wu35-fault','missing','missing','Member','active',0,0,1)",
                ),
              );
            if (fault === 'pending') {
              pending = () => target.batch(statements);
              throw new Error('D1 timeout; pending write acknowledgement unknown');
            }
            if (fault?.startsWith('sql:')) {
              const change = JSON.parse(fault.slice(4)) as { sql: string; parameters: unknown[] };
              await target
                .prepare(change.sql)
                .bind(...change.parameters)
                .run();
            }
            let before: unknown = null;
            if (fault === 'winner-actor') {
              for (let i = 0; i < 100; i++) {
                if (
                  (
                    await target
                      .prepare('SELECT id FROM files WHERE uploadRequestId=?')
                      .bind(request.headers.get('x-wu35-request'))
                      .all()
                  ).results.length
                )
                  break;
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              await target
                .prepare("UPDATE workspaceMembers SET status='invited' WHERE userId=?")
                .bind(env.LOCAL_USER_ID)
                .run();
              before = await snapshot(target);
            }
            if (fault === 'undo-winner-actor' || fault === 'undo-winner-grant') {
              undoPending = request.headers.get('x-wu35-undo');
              let consumed = false;
              for (let i = 0; i < 200; i++) {
                if (
                  (
                    await target
                      .prepare(
                        'SELECT id FROM commandUndoRecords WHERE id=? AND resultJson IS NOT NULL',
                      )
                      .bind(undoPending)
                      .all()
                  ).results.length
                ) {
                  consumed = true;
                  break;
                }
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              if (!consumed) throw new Error('Concurrent Undo winner did not commit');
              if (fault === 'undo-winner-actor')
                await target
                  .prepare("UPDATE workspaceMembers SET status='invited' WHERE userId=?")
                  .bind(env.LOCAL_USER_ID)
                  .run();
              else {
                const projectId = request.headers.get('x-wu35-project');
                const [grant] = (
                  await target
                    .prepare(
                      'SELECT p.visibility,pm.permission FROM projects p JOIN projectMembers pm ON pm.workspaceId=p.workspaceId AND pm.projectId=p.id JOIN workspaceMembers m ON m.workspaceId=pm.workspaceId AND m.id=pm.memberId WHERE p.id=? AND m.userId=?',
                    )
                    .bind(projectId, env.LOCAL_USER_ID)
                    .all<{ visibility: string; permission: string }>()
                ).results;
                if (!grant)
                  throw new Error('File fault injection requires an existing project grant');
                state.priorGrant = grant;
                await target
                  .prepare("UPDATE projects SET visibility='private' WHERE id=?")
                  .bind(projectId)
                  .run();
                await target
                  .prepare(
                    "UPDATE projectMembers SET permission='view' WHERE projectId=? AND memberId IN (SELECT id FROM workspaceMembers WHERE userId=?)",
                  )
                  .bind(projectId, env.LOCAL_USER_ID)
                  .run();
              }
              before = await snapshot(target);
            }
            const result = await target.batch(statements);
            if (
              fault === 'winner-actor' ||
              fault === 'undo-winner-actor' ||
              fault === 'undo-winner-grant'
            )
              observation = { before, after: await snapshot(target) };
            after = true;
            if (fault === 'ack' || fault === 'ack-readfail')
              throw new Error('D1 acknowledgement lost after actual commit');
            return result;
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const FILES = new Proxy(env.FILES, {
      get(target, key) {
        if (key === 'put')
          return async (...args: Parameters<R2Bucket['put']>) => {
            if (fault === 'r2-put') throw new Error('Simulated R2 put failure');
            const value = await target.put(...args);
            if (fault === 'r2-put-ack') throw new Error('Lost R2 acknowledgement after actual put');
            if (barrier) {
              let row = barriers.get(barrier);
              if (!row) {
                let release!: () => void;
                const promise = new Promise<void>((resolve) => (release = resolve));
                row = { count: 0, promise, release };
                barriers.set(barrier, row);
              }
              row.count++;
              if (row.count === 2) {
                row.release();
                barriers.delete(barrier);
              }
              await row.promise;
            }
            return value;
          };
        if (key === 'delete' && fault === 'cleanup-rollback')
          return () => Promise.reject(new Error('Simulated R2 cleanup failure'));
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const response = await app.fetch(request, { ...env, DB, FILES }, context);
    if (fault === 'winner-actor' || fault === 'undo-winner-actor')
      await env.DB.prepare("UPDATE workspaceMembers SET status='active' WHERE userId=?")
        .bind(env.LOCAL_USER_ID)
        .run();
    if (fault === 'undo-winner-grant' && state.priorGrant) {
      await env.DB.prepare('UPDATE projects SET visibility=? WHERE id=?')
        .bind(state.priorGrant.visibility, request.headers.get('x-wu35-project'))
        .run();
      await env.DB.prepare(
        'UPDATE projectMembers SET permission=? WHERE projectId=? AND memberId IN (SELECT id FROM workspaceMembers WHERE userId=?)',
      )
        .bind(state.priorGrant.permission, request.headers.get('x-wu35-project'), env.LOCAL_USER_ID)
        .run();
    }
    if (fault === 'undo-winner-actor' || fault === 'undo-winner-grant') undoPending = null;
    const headers = new Headers(response.headers);
    headers.set('x-wu35-queries', String(queries));
    headers.set('x-wu35-parameters', String(maxParameters));
    return new Response(response.body, { status: response.status, headers });
  },
};
