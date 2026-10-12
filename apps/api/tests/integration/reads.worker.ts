import { z } from 'zod';
import {
  EntityIdSchema,
  TaskQuerySchema,
  ProjectQuerySchema,
  MemberQuerySchema,
  FileQuerySchema,
  ActivityQuerySchema,
  NotificationQuerySchema,
} from '@studio/contracts/api';
import { filterTasks, sortTasks, summarizeTasks } from '@studio/domain';
import app from '../../src/index.ts';
import { RequestRepository } from '../../src/db/client.ts';
import { principal, membership, members } from '../../src/modules/members/index.ts';
import { taskDataset } from '../../src/modules/tasks/projections.ts';
import { projectCatalog } from '../../src/modules/projects/projections.ts';
import { fileDto } from '../../src/modules/files/projections.ts';
import { listFilesReadFiles } from '../../src/modules/files/persistence/queries.ts';
import { listActivityReadActivity } from '../../src/modules/activity/persistence/queries.ts';
import { listNotificationsRead } from '../../src/modules/notifications/persistence/commands.ts';
import { listCommentsReadCommentReactions } from '../../src/modules/comments/persistence/commands.ts';
import { commentDto, reactionProjection } from '../../src/modules/comments/projections.ts';
const ReactionPairsSchema = z.array(z.object({ key: z.string(), memberId: EntityIdSchema }));
const OracleSchema = z.object({
  kind: z.enum([
    'tasks',
    'summary',
    'projects',
    'members',
    'files',
    'comments',
    'activity',
    'notifications',
  ]),
  query: z.unknown(),
  projectId: EntityIdSchema.optional(),
  taskId: EntityIdSchema.optional(),
  now: z.number().finite(),
});
interface Observation {
  sql: string;
  parameters: unknown[];
  rowsRead: number | null;
  returnedRows: number | null;
}
export default {
  async fetch(
    request: Request,
    env: CloudflareBindings,
    context: ExecutionContext,
  ): Promise<Response> {
    if (new URL(request.url).pathname === '/__reads/oracle') {
      const input = OracleSchema.parse(await request.json()),
        repository = new RequestRepository(env.DB);
      const user = await principal(
        repository,
        EntityIdSchema.parse(env.LOCAL_USER_ID),
        EntityIdSchema.parse(env.LOCAL_WORKSPACE_ID),
      );
      const member = await membership(repository, user.currentWorkspaceId, user.user.id),
        scope = { workspaceId: user.currentWorkspaceId, memberId: member.id };
      const q = input.query;
      if (input.kind === 'tasks' || input.kind === 'summary') {
        const query = TaskQuerySchema.parse(q),
          dataset = await taskDataset(repository, scope, input.now);
        const items = sortTasks(
          filterTasks(dataset.items, query, dataset.env),
          query,
          dataset.env.lookups,
        );
        return Response.json({
          items,
          total: items.length,
          summary: summarizeTasks(items, dataset.env.today),
          trace: repository.trace,
        });
      }
      if (input.kind === 'members') {
        const query = MemberQuerySchema.parse(q),
          items = (await members(repository, scope))
            .filter(
              (m) =>
                (!query.teamId || m.teamId === query.teamId) &&
                (!query.status || m.status === query.status) &&
                (!query.q ||
                  [m.name, m.email, m.title].some((value) =>
                    value.toLowerCase().includes(query.q.toLowerCase()),
                  )),
            )
            .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        return Response.json({ items, total: items.length, trace: repository.trace });
      }
      if (input.kind === 'projects') {
        const query = ProjectQuerySchema.parse(q),
          catalog = await projectCatalog(repository, scope, input.now),
          states = await repository.all<{ id: string; archivedAt: number | null }>(
            'SELECT id,archivedAt FROM projects WHERE workspaceId=?',
            [scope.workspaceId],
          );
        const items = catalog.filter(
          (item) =>
            !!states.find((state) => state.id === item.project.id)?.archivedAt === query.archived &&
            (!query.status || item.project.status === query.status) &&
            (!query.q ||
              item.project.name.toLowerCase().includes(query.q.toLowerCase()) ||
              (item.access === 'allowed' ? item.project.description : item.project.catalogSummary)
                .toLowerCase()
                .includes(query.q.toLowerCase())),
        );
        const value = (item: (typeof items)[number]) =>
          query.sort === 'name'
            ? item.project.name
            : query.sort === 'due'
              ? (item.project.dueDate ?? '9999')
              : query.sort === 'progress'
                ? item.access === 'allowed'
                  ? -item.summary.progress
                  : 0
                : item.access === 'allowed'
                  ? item.project.lastActivityAt
                  : '';
        items.sort((a, b) => {
          const av = value(a),
            bv = value(b),
            order =
              typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av).localeCompare(String(bv));
          return (
            (query.sort === 'recent' ? -order : order) || a.project.id.localeCompare(b.project.id)
          );
        });
        return Response.json({ items, total: items.length, trace: repository.trace });
      }
      if (input.kind === 'files') {
        const query = FileQuerySchema.parse(q),
          projectId = EntityIdSchema.parse(input.projectId),
          rows = await listFilesReadFiles(repository, scope, projectId);
        const items = rows.filter(
          (f) =>
            (!query.q || f.name.toLowerCase().includes(query.q.toLowerCase())) &&
            (!query.type || f.fileType === query.type),
        );
        const value = (f: (typeof items)[number]) =>
          query.sort === 'recent'
            ? -f.createdAt
            : query.sort === 'size'
              ? -(f.sizeBytes ?? -1)
              : query.sort === 'type'
                ? f.fileType
                : f.name;
        items.sort((a, b) => {
          const av = value(a),
            bv = value(b);
          return (
            (typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv))) || a.id.localeCompare(b.id)
          );
        });
        return Response.json({ items: items.map(fileDto), total: items.length });
      }
      if (input.kind === 'comments') {
        const rows = await listCommentsReadCommentReactions(
          repository,
          scope,
          EntityIdSchema.parse(input.taskId),
        );
        return Response.json({
          items: rows.map((row) =>
            commentDto(
              row,
              reactionProjection(ReactionPairsSchema.parse(JSON.parse(row.reactionsJson))),
            ),
          ),
          total: rows.length,
        });
      }
      if (input.kind === 'activity') {
        const query = ActivityQuerySchema.parse(q),
          rows = await listActivityReadActivity(repository, query, scope);
        return Response.json({
          items: rows.map((row) => ({
            id: row.id,
            actorId: row.actorId,
            eventType: row.eventType,
            taskId: row.taskId,
            projectId: row.projectId,
            createdAt: new Date(row.createdAt).toISOString(),
            payload: JSON.parse(row.payloadJson),
          })),
          total: rows.length,
        });
      }
      const query = NotificationQuerySchema.parse(q),
        rows = await listNotificationsRead(repository, scope),
        items = rows
          .filter(
            (n) =>
              (query.category === 'all' || n.type === query.category) &&
              (!query.unreadOnly || n.readAt === null),
          )
          .map((n) => ({
            id: n.id,
            workspaceId: n.workspaceId,
            recipientId: n.recipientId,
            actorId: n.actorId,
            projectId: n.projectId,
            taskId: n.taskId,
            type: n.type,
            text: n.text,
            snippet: n.snippet,
            createdAt: new Date(n.createdAt).toISOString(),
            readAt: n.readAt === null ? null : new Date(n.readAt).toISOString(),
          }));
      return Response.json({
        items,
        total: items.length,
        unreadCount: rows.filter((n) => n.readAt === null).length,
      });
    }
    const observations: Observation[] = [],
      targets = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
    function wrap(
      statement: D1PreparedStatement,
      sql: string,
      parameters: unknown[],
    ): D1PreparedStatement {
      const proxy = new Proxy(statement, {
        get(target, key) {
          if (key === 'bind')
            return (...values: unknown[]) => wrap(target.bind(...values), sql, values);
          if (key === 'all')
            return async () => {
              const result = await target.all();
              observations.push({
                sql,
                parameters,
                rowsRead: result.meta.rows_read ?? null,
                returnedRows: result.results.length,
              });
              return result;
            };
          if (key === 'raw')
            return async (...args: Parameters<D1PreparedStatement['raw']>) => {
              const result = await target.raw(...args);
              observations.push({ sql, parameters, rowsRead: null, returnedRows: result.length });
              return result;
            };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      targets.set(proxy, statement);
      return proxy;
    }
    const binding = new Proxy(env.DB, {
      get(target, key) {
        if (key === 'prepare') return (sql: string) => wrap(target.prepare(sql), sql, []);
        if (key === 'batch')
          return async (statements: D1PreparedStatement[]) => {
            const results = await target.batch(
              statements.map((statement) => targets.get(statement) ?? statement),
            );
            results.forEach((result) =>
              observations.push({
                sql: '',
                parameters: [],
                rowsRead: result.meta.rows_read ?? null,
                returnedRows: result.results.length,
              }),
            );
            return results;
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const response = await app.fetch(request, { ...env, DB: binding }, context),
      headers = new Headers(response.headers);
    const plans = [];
    if (request.headers.get('x-read-explain') === 'yes')
      for (const observation of observations) {
        if (!observation.sql) continue;
        const result = await env.DB.prepare('EXPLAIN QUERY PLAN ' + observation.sql)
          .bind(...observation.parameters)
          .all();
        plans.push(result.results);
      }
    headers.set(
      'x-read-observations',
      JSON.stringify(
        observations.map(({ sql, parameters, ...metrics }) => {
          void [sql, parameters];
          return metrics;
        }),
      ),
    );
    if (plans.length) headers.set('x-read-plans', JSON.stringify(plans));
    return new Response(response.body, { status: response.status, headers });
  },
};
