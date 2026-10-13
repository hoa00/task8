import type { QueryClient } from '@tanstack/react-query';
import type { AuthLoginInput, Ict24hSessionDto, OperationOutput } from '@studio/contracts/api';
import type { StudioClient } from './operations.ts';
import { queryKeys } from './query-keys.ts';

export interface AuthFacade {
  connect(cache: QueryClient): void;
  expectedSessionId():string|undefined;
  login(input:AuthLoginInput):Promise<Ict24hSessionDto>;
  refresh():Promise<Ict24hSessionDto>;
  logout():Promise<void>;
  check():Promise<OperationOutput<'getSession'>>;
}
export function createHttpAuth(client:StudioClient):AuthFacade {
  let cache:QueryClient|undefined;
  const expectedSessionId=()=>cache?.getQueryData<OperationOutput<'getSession'>>(queryKeys.session())?.data.authSession?.id;
  return {
    connect(value){cache=value;},
    expectedSessionId,
    async login(input){const result=await client.execute('authLogin',{body:input});await cache?.cancelQueries();cache?.clear();cache?.setQueryData(queryKeys.session(),result);return result.data;},
    async refresh(){const result=await client.execute('authRefresh',{});cache?.setQueryData(queryKeys.session(),result);return result.data;},
    async logout(){await client.execute('authLogout',{});await cache?.cancelQueries();cache?.clear();},
    async check(){const result=await client.execute('getSession',{});cache?.setQueryData(queryKeys.session(),result);const workspaces=await client.execute('listWorkspaces',{});cache?.setQueryData(queryKeys.workspaces(),workspaces);return result;},
  };
}
