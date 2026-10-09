import { useQuery } from '@tanstack/react-query';
import type { TaskQuery } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { queryKeys } from '../../data/query-keys';
import { loadTaskViewDataset } from './loadTaskViewDataset';
export { loadTaskViewDataset } from './loadTaskViewDataset';
export type { TaskViewDataset } from './loadTaskViewDataset';
export function useTaskBoardDataset(workspaceId: string, query: TaskQuery, enabled: boolean) {
 const {client}=useDataRuntime();
 return useQuery({enabled,queryKey:[...queryKeys.workspace(workspaceId),'tasks','complete-view',query],queryFn:({signal})=>loadTaskViewDataset(client,workspaceId,query,signal)});
}
