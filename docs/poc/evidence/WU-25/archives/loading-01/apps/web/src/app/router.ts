import { createRouter } from '@tanstack/react-router';
import { routeTree } from '../routeTree.gen';
import type { StudioRouterContext } from './route-context';
export function createStudioRouter(context:Omit<StudioRouterContext,'navigation'>) {const navigation={workspaceId:null as string|null};const router=createRouter({routeTree,context:{...context,navigation},scrollRestoration:true,scrollToTopSelectors:['#main-content'],defaultPendingMs:0,defaultPendingMinMs:0});router.subscribe('onResolved',()=>{const match=router.state.matches.find(match=>match.routeId==='/_shell');if(match && 'workspaceId' in match.context)navigation.workspaceId=String(match.context.workspaceId);});return router;}
declare module '@tanstack/react-router' {interface Register {router:ReturnType<typeof createStudioRouter>;}}
