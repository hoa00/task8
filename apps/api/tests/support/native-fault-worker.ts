// Native fault control only. Every request executes the current production app.
import { z } from 'zod';
import app from '../../src/index.ts';
const sqlInput = z.object({
  sql: z.string(),
  parameters: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
});
const changeInput = sqlInput.extend({
  snapshot: z.boolean().optional(),
  restore: sqlInput
    .extend({ parameters: z.array(z.union([z.string(), z.number(), z.null()])) })
    .optional(),
});
const tables = [
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
];
async function snapshot(database: D1Database) {
  const rows: Record<string, unknown> = {};
  for (const table of tables)
    rows[table] = (await database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
  return rows;
}
export function nativeFaultWorker(owner: 'wu31' | 'wu32' | 'wu33' | 'wu34') {
  let observation: unknown = null;
  return {
    async fetch(
      request: Request,
      env: CloudflareBindings,
      context: ExecutionContext,
    ): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (owner === 'wu34' && path === `/__${owner}/injection`) return Response.json(observation);
      if (path === `/__${owner}/sql`) {
        const input = sqlInput.parse(await request.json());
        return Response.json(
          await env.DB.prepare(input.sql)
            .bind(...(input.parameters ?? []))
            .all(),
        );
      }
      if (path === `/__${owner}/snapshot`)
        return Response.json({ now: Date.now(), rows: await snapshot(env.DB) });
      const injection = request.headers.get(`x-${owner}-test`);
      let injected = false,
        queries = 0,
        maximumParameters = 0;
      let change: z.infer<typeof changeInput> | null = null,
        before: unknown = null;
      const binding = new Proxy(env.DB, {
        get(target, key) {
          if (key === 'prepare')
            return (sql: string) => {
              queries++;
              const prepared = target.prepare(sql);
              return new Proxy(prepared, {
                get(statement, field) {
                  if (field === 'bind')
                    return (...parameters: unknown[]) => {
                      maximumParameters = Math.max(maximumParameters, parameters.length);
                      const bound = statement.bind(...parameters);
                      return new Proxy(bound, {
                        get(result, property) {
                          if (owner !== 'wu31' && (property === 'all' || property === 'run'))
                            return async () => {
                              try {
                                return property === 'all' ? await result.all() : await result.run();
                              } catch (error) {
                                console.error(`${owner} D1 read failure`, sql, error);
                                throw error;
                              }
                            };
                          const value = Reflect.get(result, property, result);
                          return typeof value === 'function' ? value.bind(result) : value;
                        },
                      });
                    };
                  const value = Reflect.get(statement, field, statement);
                  return typeof value === 'function' ? value.bind(statement) : value;
                },
              });
            };
          if (key === 'batch')
            return async (statements: D1PreparedStatement[]) => {
              if (!injected && injection) {
                injected = true;
                if (injection === 'fail')
                  statements.splice(
                    1,
                    0,
                    target.prepare(
                      "INSERT INTO workspaceMembers(id,workspaceId,userId,role,status,createdAt,updatedAt,version) VALUES ('missing-fk','missing','missing','Member','active',0,0,1)",
                    ),
                  );
                else {
                  change = changeInput.parse(JSON.parse(injection));
                  await target
                    .prepare(change.sql)
                    .bind(...(change.parameters ?? []))
                    .run();
                  if (owner === 'wu34' && change.snapshot) before = await snapshot(target);
                }
              }
              try {
                const result = await target.batch(statements);
                if (owner === 'wu34' && change?.snapshot)
                  observation = { before, after: await snapshot(target), injectedChange: change };
                return result;
              } catch (error) {
                if (owner !== 'wu31') console.error(`${owner} D1 batch failure`, error);
                throw error;
              } finally {
                if (owner === 'wu34' && change?.restore)
                  await target
                    .prepare(change.restore.sql)
                    .bind(...change.restore.parameters)
                    .run();
              }
            };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const response = await app.fetch(request, { ...env, DB: binding }, context),
        headers = new Headers(response.headers);
      headers.set(`x-${owner}-queries`, String(queries));
      headers.set(`x-${owner}-parameters`, String(maximumParameters));
      return new Response(response.body, { status: response.status, headers });
    },
  };
}
