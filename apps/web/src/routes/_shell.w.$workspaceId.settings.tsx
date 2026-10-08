import {createFileRoute,Outlet} from '@tanstack/react-router';
export const Route=createFileRoute('/_shell/w/$workspaceId/settings')({component:Outlet});
