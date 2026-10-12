import {
  CalendarEventSchema,
  CommentSchema,
  FileSchema,
  MilestoneSchema,
} from '@studio/contracts/api';
import { completedInRollingWeek, homeDeadlines, summarizeTasks } from '@studio/domain';
import { accessSql } from '../db/guards.ts';
import { readBootstrap } from './bootstrap.ts';
import { listActivity } from './activity.ts';
import { projectCatalog, projectRow, today } from './read-model.ts';
import { taskDataset, taskDto, taskSelect } from './task-read.ts';
import { instant } from './shared.ts';
import { projectionPage } from './projection-page.ts';
import type {
  ArchiveItemDto,
  ArchiveQuerySchema,
  DateRangeQuerySchema,
  MemberDto,
  MilestoneQuerySchema,
  SearchQuerySchema,
  SearchResultDto,
} from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
import type { TaskProjection } from './task-read.ts';
import type { files } from '../db/schema.ts';
export async function home(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  now: number,
) {
  const dataset = await taskDataset(r, s, now),
    tasks = dataset.items.filter((t) => !t.archivedAt),
    bootstrap = await readBootstrap(r, s, actor, now),
    projects = bootstrap.projects.filter(
      (p) => p.access === 'allowed' && p.project.status !== 'complete',
    );
  const mine = tasks.filter((t) => t.assigneeId === s.memberId),
    deadlines = homeDeadlines(tasks, dataset.env.today).flatMap((g) => g.tasks),
    recentActivity = await listActivity(r, s, { limit: 7 });
  return {
    counters: {
      totalTasks: tasks.length,
      completedThisWeek: completedInRollingWeek(tasks, instant(now)),
      overdue: summarizeTasks(tasks, dataset.env.today).overdue,
      activeProjects: projects.length,
    },
    myTasks: { items: mine, total: mine.length },
    deadlines: { items: deadlines, total: deadlines.length },
    projects: { items: projects, total: projects.length },
    recentActivity: { items: recentActivity.items, total: recentActivity.total },
  };
}
export async function overview(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  now: number,
) {
  const dataset = await taskDataset(r, s, now),
    tasks = dataset.items.filter((t) => !t.archivedAt),
    projects = (await readBootstrap(r, s, actor, now)).projects.filter(
      (p) => p.access === 'allowed',
    );
  const workload = dataset.env.lookups.members
    .filter((m) => m.status === 'active')
    .map((m) => ({
      member: { id: m.id, name: m.name, avatarColor: m.avatarColor },
      openTasks: tasks.filter((t) => t.assigneeId === m.id && t.status !== 'done').length,
    }))
    .sort((a, b) => b.openTasks - a.openTasks);
  const milestones = projects
    .flatMap((p) => (p.access === 'allowed' ? p.project.milestones : []))
    .filter((m) => m.date >= dataset.env.today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, 6);
  return { taskSummary: summarizeTasks(tasks, dataset.env.today), projects, workload, milestones };
}
export async function calendar(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof DateRangeQuerySchema> | z.infer<typeof MilestoneQuerySchema>,
  milestones = false,
) {
  if (query.projectId) await projectRow(r, s, query.projectId, true);
  const table = milestones ? 'projectMilestones' : 'calendarEvents';
  const rows = await r.all(
    `SELECT e.* FROM ${table} e JOIN projects p ON p.workspaceId=e.workspaceId AND p.id=e.projectId WHERE e.workspaceId=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql} ${query.projectId ? 'AND e.projectId=?' : ''} ${query.from ? 'AND e.date>=?' : ''} ${query.to ? 'AND e.date<=?' : ''} ORDER BY e.date,${milestones ? 'e.position' : 'e.localTime'},e.id`,
    [
      s.workspaceId,
      s.memberId,
      ...(query.projectId ? [query.projectId] : []),
      ...(query.from ? [query.from] : []),
      ...(query.to ? [query.to] : []),
    ],
  );
  return rows.map((row) =>
    milestones ? MilestoneSchema.parse(row) : CalendarEventSchema.parse(row),
  );
}
export async function archive(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof ArchiveQuerySchema>,
  now: number,
) {
  const q = query.q.trim().toLowerCase(),
    has = (text: string) => !q || text.toLowerCase().includes(q);
  let rows: { id: string; value: string | number; row: ArchiveItemDto }[];
  if (query.kind === 'tasks') {
    const tasks = await r.all<TaskProjection>(
      `${taskSelect} WHERE t.workspaceId=? AND t.archivedAt IS NOT NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql}`,
      [s.memberId, s.memberId, s.workspaceId, s.memberId],
    );
    rows = tasks
      .map(taskDto)
      .filter((t) => has(t.title + ' ' + t.key))
      .map((t) => ({ id: t.id, value: t.archivedAt!, row: { kind: 'tasks', task: t } }));
  } else {
    const ranks = await r.all<{ id: string; rank: number }>(
      `SELECT p.id,p.rowid rank FROM projects p WHERE p.workspaceId=? AND p.archivedAt IS NOT NULL AND p.deletedAt IS NULL AND ${accessSql} ORDER BY p.rowid`,
      [s.workspaceId, s.memberId],
    );
    // Archive project summaries include archived children and exclude tombstones.
    const tasks = (
        await r.all<TaskProjection>(
          `${taskSelect} WHERE t.workspaceId=? AND t.deletedAt IS NULL AND p.archivedAt IS NOT NULL AND p.deletedAt IS NULL AND ${accessSql}`,
          [s.memberId, s.memberId, s.workspaceId, s.memberId],
        )
      ).map(taskDto),
      date = await today(r, s, now);
    rows = (await projectCatalog(r, s, now))
      .filter((p) => p.access === 'allowed' && p.project.archivedAt && has(p.project.name))
      .map((p) => ({
        id: p.project.id,
        value: ranks.find((row) => row.id === p.project.id)!.rank,
        row: {
          kind: 'projects',
          project:
            p.access === 'allowed'
              ? {
                  ...p,
                  summary: {
                    ...p.summary,
                    taskSummary: summarizeTasks(
                      tasks.filter((t) => t.projectId === p.project.id),
                      date,
                    ),
                  },
                }
              : p,
        },
      }));
  }
  const result = await projectionPage(
    rows,
    query,
    { scope: s, kind: 'archive', entity: query.kind, q },
    (row) => row.value,
    query.kind === 'tasks',
  );
  return { ...result, items: result.items.map((item) => item.row) };
}
export async function search(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof SearchQuerySchema>,
  now: number,
) {
  const q = query.q.trim().toLowerCase(),
    has = (text: string | null | undefined) => !!q && !!text?.toLowerCase().includes(q),
    dataset = await taskDataset(r, s, now),
    tasks = dataset.items.filter((t) => !t.archivedAt),
    taskIds = new Set<string>(tasks.map((t) => t.id));
  const projects = (await projectCatalog(r, s, now)).filter(
    (p) => p.access === 'allowed' && !p.project.archivedAt,
  );
  const fileRows = await r.all<typeof files.$inferSelect>(
    `SELECT f.* FROM files f JOIN projects p ON p.workspaceId=f.workspaceId AND p.id=f.projectId LEFT JOIN tasks t ON t.workspaceId=f.workspaceId AND t.id=f.taskId WHERE f.workspaceId=? AND f.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql} AND (f.taskId IS NULL OR (t.id IS NOT NULL AND t.projectId=f.projectId AND t.archivedAt IS NULL AND t.deletedAt IS NULL))`,
    [s.workspaceId, s.memberId],
  );
  const commentRows = await r.all<{
    id: string;
    workspaceId: string;
    taskId: string;
    authorId: string;
    bodyText: string;
    mentionedMemberIdsJson: string;
    createdAt: number;
    version: number;
    reactionsJson: string;
  }>(
    `SELECT c.*,(SELECT json_group_array(json_object('key',reactionKey,'memberId',memberId)) FROM (SELECT reactionKey,memberId FROM commentReactions WHERE workspaceId=c.workspaceId AND commentId=c.id ORDER BY reactionKey,memberId)) reactionsJson FROM comments c JOIN tasks t ON t.workspaceId=c.workspaceId AND t.id=c.taskId JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE c.workspaceId=? AND c.deletedAt IS NULL AND t.archivedAt IS NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql}`,
    [s.workspaceId, s.memberId],
  );
  const rows: SearchResultDto[] = [
    ...tasks
      .filter(
        (t) =>
          has(t.title) ||
          has(t.key) ||
          has(dataset.rows.find((row) => row.id === t.id)?.descriptionText),
      )
      .map((task) => ({ kind: 'tasks' as const, task })),
    ...projects
      .filter((p) => has(p.project.name) || (p.access === 'allowed' && has(p.project.description)))
      .map((project) => ({ kind: 'projects' as const, project })),
    ...dataset.env.lookups.members
      .filter((m) => has(m.name) || has(m.email) || has(m.title))
      .map((member) => ({ kind: 'people' as const, member })),
    ...fileRows
      .filter((f) => has(f.name))
      .map((f) => ({
        kind: 'files' as const,
        file: FileSchema.parse({
          id: f.id,
          workspaceId: f.workspaceId,
          projectId: f.projectId,
          taskId: f.taskId,
          name: f.name,
          fileType: f.fileType,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          displaySize: f.displaySize,
          storageMode: f.storageMode,
          contentAvailable: f.storageMode === 'r2',
          createdBy: f.createdBy,
          createdAt: instant(f.createdAt),
          version: f.version,
        }),
      })),
    ...commentRows
      .filter((c) => taskIds.has(c.taskId) && has(c.bodyText))
      .map((c) => {
        const pairs = JSON.parse(c.reactionsJson) as { key: string; memberId: string }[],
          task = tasks.find((t) => t.id === c.taskId)!;
        return {
          kind: 'comments' as const,
          comment: CommentSchema.parse({
            id: c.id,
            workspaceId: c.workspaceId,
            taskId: c.taskId,
            authorId: c.authorId,
            bodyText: c.bodyText,
            mentionedMemberIds: JSON.parse(c.mentionedMemberIdsJson),
            createdAt: instant(c.createdAt),
            version: c.version,
            reactions: [...new Set(pairs.map((p) => p.key))].map((key) => {
              const memberIds = pairs.filter((p) => p.key === key).map((p) => p.memberId);
              return { key, count: memberIds.length, memberIds };
            }),
          }),
          taskKey: task.key,
          taskTitle: task.title,
        };
      }),
  ];
  const kinds = ['tasks', 'projects', 'people', 'files', 'comments'],
    totals = { tasks: 0, projects: 0, people: 0, files: 0, comments: 0 };
  rows.forEach((row) => totals[row.kind]++);
  const entityId = (row: SearchResultDto) =>
    row.kind === 'tasks'
      ? row.task.id
      : row.kind === 'projects'
        ? row.project.project.id
        : row.kind === 'people'
          ? row.member.id
          : row.kind === 'files'
            ? row.file.id
            : row.comment.id;
  const selected = rows
    .filter((row) => query.category === 'all' || row.kind === query.category)
    .map((row) => ({ id: entityId(row), row }));
  const result = await projectionPage(
    selected,
    query,
    { scope: s, kind: 'search', q, category: query.category },
    (item) => kinds.indexOf(item.row.kind),
  );
  return { ...result, items: result.items.map((item) => item.row), totals };
}
