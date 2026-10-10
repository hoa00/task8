import {createFileRoute,Outlet} from '@tanstack/react-router';
import {NotFoundBoundary,ErrorBoundary,LoadingBoundary} from '../app/shell/Boundaries';
import {validId} from '../app/route-context';
export const Route=createFileRoute('/_shell/w/$workspaceId')({params:{parse:params=>({...params,workspaceId:validId(params.workspaceId)})},component:Outlet,notFoundComponent:NotFoundBoundary,errorComponent:ErrorBoundary,pendingComponent:LoadingBoundary});
