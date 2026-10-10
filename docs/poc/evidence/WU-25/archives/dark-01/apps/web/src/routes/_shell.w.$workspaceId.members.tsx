import {createFileRoute,Outlet} from '@tanstack/react-router';
export const Route=createFileRoute('/_shell/w/$workspaceId/members')({component:Outlet});
