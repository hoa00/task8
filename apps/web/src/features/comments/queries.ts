import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import type { OperationInput } from '@studio/contracts/api';
import type { StudioClient } from '../../data/operations';
import { useDataRuntime } from '../../data/context';
import { operationQueryKey } from '../../data/query-keys';
export function commentQueryOptions(client:StudioClient,workspaceId:string,taskId:string){const input:OperationInput<'listComments'>={workspaceId,taskId,query:{limit:200}};return infiniteQueryOptions({queryKey:[...operationQueryKey('listComments',input),'pages'],initialPageParam:undefined as string|undefined,queryFn:({pageParam,signal})=>client.execute('listComments',{...input,query:{limit:200,...(pageParam?{cursor:pageParam}:{})}},{signal}),getNextPageParam:last=>last.data.nextCursor??undefined});}
export function activityQueryOptions(client:StudioClient,workspaceId:string,taskId:string){const input:OperationInput<'listActivity'>={workspaceId,query:{taskId,limit:200}};return infiniteQueryOptions({queryKey:[...operationQueryKey('listActivity',input),'pages'],initialPageParam:undefined as string|undefined,queryFn:({pageParam,signal})=>client.execute('listActivity',{...input,query:{taskId,limit:200,...(pageParam?{cursor:pageParam}:{})}},{signal}),getNextPageParam:last=>last.data.nextCursor??undefined});}
export function useTaskConversation(workspaceId:string,taskId:string){const {client}=useDataRuntime();return {comments:useInfiniteQuery(commentQueryOptions(client,workspaceId,taskId)),activity:useInfiniteQuery(activityQueryOptions(client,workspaceId,taskId))};}
