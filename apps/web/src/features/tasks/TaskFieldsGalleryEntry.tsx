import { useStudioQuery } from '../../data/queries';
import { TaskFieldsGallery } from './TaskFieldsGallery';
export function TaskFieldsGalleryEntry({ onFailNext }: { onFailNext: () => void }) { const session = useStudioQuery('getSession', {}); const workspaceId=session.data?.data.currentWorkspaceId; return workspaceId ? <TaskFieldsGallery workspaceId={workspaceId} onFailNext={onFailNext} /> : <div>Loading…</div>; }
