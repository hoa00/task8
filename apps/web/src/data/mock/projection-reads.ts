import { DateRangeQuerySchema } from '@studio/contracts/api';
import type { OperationId, WorkspaceDto } from '@studio/contracts/api';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { StudioApiError, unavailable } from '../errors.ts';
import { canReadMockProject as canReadProject } from './project-access.ts';
import { readBootstrap, readSession } from './reads.ts';
import { readArchive } from './archive.ts';
import { readHome, readOverview } from './dashboards.ts';
import { readSearch } from './search.ts';
import { readMember, readMemberSummary } from './people.ts';

export async function readMockProjection(
  id: OperationId,
  input: Record<string, unknown>,
  dataset: MockDataset,
  clock: Clock,
  workspaceCatalog: () => WorkspaceDto[],
) {
  switch (id) {
    case 'listArchive':
      return { data: await readArchive(dataset, input.query, clock) };
    case 'getMember':
      return { data: readMember(dataset, input.memberId) };
    case 'getMemberSummary':
      return { data: readMemberSummary(dataset, input.memberId, clock) };
    case 'search':
      return { data: await readSearch(dataset, input.query, clock) };
    case 'getHome':
      return { data: readHome(dataset, clock) };
    case 'getOverview':
      return { data: readOverview(dataset, clock) };
    case 'listCalendarEvents': {
      const query = DateRangeQuerySchema.parse(input.query);
      if (
        query.projectId &&
        (!canReadProject(dataset.projects[query.projectId], dataset) ||
          dataset.projects[query.projectId]!.archivedAt)
      )
        throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
      return {
        data: Object.values(dataset.events)
          .filter(
            (event) =>
              event.workspaceId === dataset.workspaceId &&
              event.date >= query.from &&
              event.date <= query.to &&
              (!query.projectId || event.projectId === query.projectId) &&
              canReadProject(dataset.projects[event.projectId], dataset) &&
              !dataset.projects[event.projectId]!.archivedAt,
          )
          .sort((a, b) => a.id.localeCompare(b.id)),
      };
    }
    case 'getSession':
      return { data: readSession(dataset) };
    case 'listWorkspaces':
      return { data: workspaceCatalog() };
    case 'getBootstrap':
      return { data: readBootstrap(dataset, clock) };
    case 'getWorkspace':
      return { data: dataset.workspaces[dataset.workspaceId] };
    case 'getProfile':
      return { data: readSession(dataset).user };
    case 'getPreferences':
      return { data: dataset.preferences };
    case 'getNotificationPreferences':
      return { data: dataset.notificationPreferences };
    default:
      throw unavailable(id);
  }
}
