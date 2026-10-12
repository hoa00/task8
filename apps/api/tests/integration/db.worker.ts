import { and, eq } from 'drizzle-orm';
import { projects as projectTable } from '../../src/db/schema.ts';
import { readAccessExpression } from '../../src/modules/projects/access.ts';
import app from '../../src/index.ts';
import { RequestRepository } from '../../src/db/client.ts';
import { exactSet, gatedInsert } from '../../src/db/commands.ts';
import { tasks, users } from '../../src/db/schema.ts';
import { sourceId } from '@studio/contracts';
import type { EntityId, MemberDto } from '@studio/contracts/api';
import { inArray } from 'drizzle-orm';
import {
  actorSql,
  actorParameters,
  canAct,
  canAccessProject,
  readAccessSql,
  writeAccessSql,
} from '../../src/modules/projects/index.ts';
import type { ActorMode } from '../../src/modules/projects/index.ts';
import { newId } from '../../src/shared/ids.ts';
const wid = sourceId('workspaces', 'w1'),
  tid = sourceId('tasks', 't1'),
  pid = sourceId('projects', 'p6');
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const executionCount = (repository: RequestRepository) => repository.statements;
export default {
  async fetch(request: Request, env: CloudflareBindings, context: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (path === '/__db/accounting') {
      const r = new RequestRepository(env.DB);
      r.prepare('SELECT 1');
      assert(executionCount(r) === 0, 'planning must not reserve execution');
      await r.all('SELECT 1');
      await r.read((db) => db.select({ id: tasks.id }).from(tasks).limit(1));
      await r.read((db) =>
        db.batch([
          db.select({ id: tasks.id }).from(tasks).limit(1),
          db.select({ id: users.id }).from(users).limit(1),
        ]),
      );
      await r.batch([r.prepare('SELECT 1'), r.prepare('SELECT 2')]);
      await r.prepare('SELECT 1').first();
      await r.prepare('SELECT 1').raw();
      assert(executionCount(r) === 8, 'native/Drizzle execution accounted once');
      let rejected = false;
      try {
        await r.read((db) =>
          db
            .select()
            .from(tasks)
            .where(inArray(tasks.id, Array(101).fill(tid))),
        );
      } catch (error) {
        rejected = error instanceof Error && 'code' in error && error.code === 'PAYLOAD_TOO_LARGE';
      }
      assert(rejected && executionCount(r) === 8, 'Drizzle parameter cap before execution');
      rejected = false;
      try {
        await r.batch([env.DB.prepare('SELECT 1')]);
      } catch {
        rejected = true;
      }
      assert(rejected && executionCount(r) === 8, 'foreign prepared statement rejected');
      let badTable = false,
        badColumn = false;
      try {
        // @ts-expect-error Deliberately invalid internal table must fail both types and runtime.
        exactSet('tasks;DROP TABLE users', 'id=?', [tid], [{ id: tid }], ['id']);
      } catch {
        badTable = true;
      }
      try {
        // @ts-expect-error Deliberately invalid internal column must fail both types and runtime.
        exactSet('tasks', 'id=?', [tid], [{ id: tid }], ['id;DROP TABLE users']);
      } catch {
        badColumn = true;
      }
      assert(badTable && badColumn, 'unsafe identifiers rejected');
      let identifierRejected = false;
      try {
        gatedInsert(r, 'tasks', [{ illegalColumn: 1 }], { sql: '1', parameters: [] });
      } catch {
        identifierRejected = true;
      }
      assert(identifierRejected, 'insert identifiers allowlisted');
      let failed = false;
      try {
        await r.prepare('SELECT * FROM missing_accounting_table').all();
      } catch {
        failed = true;
      }
      assert(failed && executionCount(r) === 9, 'failed actual execution counted');
      return Response.json({
        passed: [
          'native+Drizzle once',
          'Drizzle parameters100',
          'foreign statements',
          'identifier allowlist',
          'failure accounting',
        ],
        statements: r.statements,
        trace: r.trace,
      });
    }
    if (path === '/__db/version')
      return Response.json(
        await env.DB.prepare('SELECT version FROM tasks WHERE id=?').bind(tid).first(),
      );
    if (path === '/__db/budget') {
      const r = new RequestRepository(env.DB);
      await r.batch(Array.from({ length: 49 }, () => r.prepare('SELECT 1')));
      let rejected = false;
      try {
        await r.batch([
          r.prepare('UPDATE tasks SET version=version+1 WHERE id=?', [tid]),
          r.prepare('SELECT 1'),
        ]);
      } catch (error) {
        rejected =
          error instanceof Error && 'code' in error && error.code === 'VIEW_SCOPE_TOO_LARGE';
      }
      assert(rejected && executionCount(r) === 49, 'remaining budget rejected before write');
      return Response.json({
        passed: true,
        statements: r.statements,
        remaining: r.remainingStatements,
      });
    }
    if (path === '/__db/seed-policy') {
      const statements = [];
      let i = 0;
      for (const role of ['Owner', 'Admin', 'Member', 'Guest'])
        for (const status of ['active', 'invited'])
          for (const removed of [false, true]) {
            const userId = newId(),
              memberId = newId(),
              email = `db-policy-${i++}@example.invalid`;
            statements.push(
              env.DB.prepare(
                "INSERT INTO users(id,name,emailNormalized,displayEmail,title,avatarColor,timezone,createdAt,updatedAt,version) VALUES(?,?,?,?,?,'#5A67D8','UTC',0,0,1)",
              ).bind(userId, email, email, email, ''),
            );
            statements.push(
              env.DB.prepare(
                'INSERT INTO workspaceMembers(id,workspaceId,userId,role,status,removedAt,createdAt,updatedAt,version) VALUES(?,?,?,?,?,?,0,0,1)',
              ).bind(memberId, wid, userId, role, status, removed ? 1 : null),
            );
          }
      await env.DB.batch(statements);
      return Response.json({ rows: i });
    }
    if (path === '/__db/actor-policy') {
      const r = new RequestRepository(env.DB),
        rows = await r.all<{
          id: EntityId;
          role: MemberDto['role'];
          status: MemberDto['status'];
          removedAt: number | null;
        }>(
          "SELECT m.id,m.role,m.status,m.removedAt FROM workspaceMembers m JOIN users u ON u.id=m.userId WHERE m.workspaceId=? AND u.displayEmail LIKE 'db-policy-%@example.invalid' ORDER BY m.id",
          [wid],
        );
      let cases = 0;
      for (const row of rows)
        for (const mode of [
          'active',
          'administrator',
          'creator',
        ] as const satisfies readonly ActorMode[]) {
          const scope = { workspaceId: wid, memberId: row.id };
          const [result] = await r.all<{ allowed: number }>(
            `SELECT ${actorSql(mode)} allowed`,
            actorParameters(scope),
          );
          assert(result, 'actor result');
          assert(
            !!result.allowed ===
              canAct({ role: row.role, status: row.status, removed: row.removedAt !== null }, mode),
            'pure/SQL actor matrix',
          );
          cases++;
        }
      assert(rows.length === 16 && executionCount(r) === 49, 'bounded complete actor matrix');
      return Response.json({ cases, statements: r.statements });
    }
    if (path === '/__db/project-policy') {
      const r = new RequestRepository(env.DB),
        memberId = sourceId('members', 'm1'),
        scope = { workspaceId: wid, memberId };
      let cases = 0;
      for (const grant of [null, 'view', 'edit'] as const) {
        await env.DB.prepare(
          'DELETE FROM projectMembers WHERE workspaceId=? AND projectId=? AND memberId=?',
        )
          .bind(wid, pid, memberId)
          .run();
        if (grant)
          await env.DB.prepare(
            'INSERT INTO projectMembers(workspaceId,projectId,memberId,permission) VALUES(?,?,?,?)',
          )
            .bind(wid, pid, memberId, grant)
            .run();
        const [row] = await r.all<{ read: number; write: number }>(
          `SELECT ${readAccessSql} read,${writeAccessSql} write FROM projects p WHERE p.workspaceId=? AND p.id=?`,
          [memberId, memberId, wid, pid],
        );
        assert(row, 'project result');
        const input = {
          visibility: 'private' as const,
          memberId,
          grants: grant ? [{ memberId, permission: grant }] : [],
        };
        assert(
          !!row.read === canAccessProject(input, 'read') &&
            !!row.write === canAccessProject(input, 'write'),
          'private view/edit/Owner no-bypass matrix',
        );
        const visible = await r.read((db) =>
          db
            .select({ id: projectTable.id })
            .from(projectTable)
            .where(
              and(
                eq(projectTable.workspaceId, wid),
                eq(projectTable.id, pid),
                readAccessExpression(projectTable, memberId),
              ),
            ),
        );
        assert(
          !!visible.length === canAccessProject(input, 'read'),
          'Drizzle/native/pure read predicate parity',
        );
        cases++;
      }
      return Response.json({ cases, scope });
    }
    return app.fetch(request, env, context);
  },
};
