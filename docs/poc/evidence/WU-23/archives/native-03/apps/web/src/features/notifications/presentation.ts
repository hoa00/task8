import type { BootstrapDto, NotificationDto, ProjectDto, TaskDto } from '@studio/contracts/api';
export function notificationProject({ notification, data, task }: { notification: NotificationDto; data: BootstrapDto; task?: TaskDto | undefined }): ProjectDto | null {
  const id = notification.projectId ?? task?.projectId;
  const row = data.projects.find(row => row.access === 'allowed' && row.project.id === id);
  return row?.access === 'allowed' ? row.project : null;
}
