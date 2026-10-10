import { useStudioQuery } from '../../data/queries';
import { TaskFieldsGallery } from './TaskFieldsGallery';
export function TaskFieldsGalleryEntry({ onFailNext }: { onFailNext: () => void }) { const session = useStudioQuery('getSession', {}); return session.data ? <TaskFieldsGallery workspaceId={session.data.data.currentWorkspaceId} onFailNext={onFailNext} /> : <div>Loading…</div>; }
