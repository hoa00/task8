import { Hono } from 'hono';
import { ArchiveQuerySchema, DateRangeQuerySchema, EmptyInputSchema, EntityIdSchema, MilestoneQuerySchema, NotificationQuerySchema, SearchQuerySchema, operations } from '@studio/contracts/api';
import { ApiFailure } from '../errors.ts';
import { archive, calendar, home, overview, search } from './projections.ts';
import { listNotifications, readAllNotifications, updateNotification } from './notifications.ts';
import { preferences } from './member-settings.ts';
import { createSavedView, changeSavedView, listSavedViews } from './saved-views.ts';
import { favoriteProject, projectOrder } from './project-personal.ts';
import type { Context } from 'hono';
import type { ApiEnvironment } from '../runtime.ts';
type C=Context<ApiEnvironment>;
const s=(c:C)=>c.get('workspace'),r=(c:C)=>c.get('repository'),id=(c:C,key:string)=>EntityIdSchema.parse(c.req.param(key)),W='/workspaces/:workspaceId';
function query(c:C) {
  if(Number(c.req.header('content-length')??0)>0||c.req.header('transfer-encoding'))throw new ApiFailure('VALIDATION_ERROR','Read does not accept body');
  const out:Record<string,unknown>={};for(const [key,values]of Object.entries(c.req.queries())){if(values.length!==1)throw new ApiFailure('VALIDATION_ERROR','Repeated query field');const value=values[0]!;if(key==='limit'){if(!/^\d+$/.test(value))throw new ApiFailure('VALIDATION_ERROR','Invalid limit');out[key]=Number(value);}else if(key==='unreadOnly'){if(value!=='true'&&value!=='false')throw new ApiFailure('VALIDATION_ERROR','Invalid boolean');out[key]=value==='true';}else out[key]=value;}return out;
}
function empty(c:C) {EmptyInputSchema.parse(query(c));}
async function body(c:C) {if(Object.keys(c.req.query()).length||!c.req.header('content-type')?.startsWith('application/json'))throw new ApiFailure('VALIDATION_ERROR','JSON body required without query fields');try{return await c.req.json();}catch{throw new ApiFailure('VALIDATION_ERROR','Invalid JSON');}}
export const projectionRoutes=new Hono<ApiEnvironment>();
projectionRoutes.get(W+'/home',async c=>{empty(c);return c.json(operations.getHome.response.parse({data:await home(r(c),s(c),c.get('currentMember'),Date.now())}));});
projectionRoutes.get(W+'/overview',async c=>{empty(c);return c.json(operations.getOverview.response.parse({data:await overview(r(c),s(c),c.get('currentMember'),Date.now())}));});
projectionRoutes.get(W+'/search',async c=>{const input=operations.search.request.parse({workspaceId:s(c).workspaceId,query:SearchQuerySchema.parse(query(c))});return c.json(operations.search.response.parse({data:await search(r(c),s(c),input.query,Date.now())}));});
projectionRoutes.get(W+'/archive',async c=>{const input=operations.listArchive.request.parse({workspaceId:s(c).workspaceId,query:ArchiveQuerySchema.parse(query(c))});return c.json(operations.listArchive.response.parse({data:await archive(r(c),s(c),input.query,Date.now())}));});
for(const [suffix,op,milestones]of [['calendar-events','listCalendarEvents',false],['milestones','listMilestones',true]] as const)projectionRoutes.get(W+'/'+suffix,async c=>{const input=operations[op].request.parse({workspaceId:s(c).workspaceId,query:(milestones?MilestoneQuerySchema:DateRangeQuerySchema).parse(query(c))});return c.json(operations[op].response.parse({data:await calendar(r(c),s(c),input.query,milestones)}));});
for(const [suffix,get,update,notification]of [['preferences','getPreferences','updatePreferences',false],['notification-preferences','getNotificationPreferences','updateNotificationPreferences',true]] as const){
  projectionRoutes.get(W+'/me/'+suffix,async c=>{empty(c);return c.json(operations[get].response.parse({data:await preferences(r(c),s(c),notification)}));});
  projectionRoutes.patch(W+'/me/'+suffix,async c=>{const input=operations[update].request.parse({workspaceId:s(c).workspaceId,body:await body(c)});return c.json(operations[update].response.parse({data:await preferences(r(c),s(c),notification,input.body,Date.now())}));});
}
projectionRoutes.get(W+'/notifications',async c=>{const input=operations.listNotifications.request.parse({workspaceId:s(c).workspaceId,query:NotificationQuerySchema.parse(query(c))});return c.json(operations.listNotifications.response.parse({data:await listNotifications(r(c),s(c),input.query)}));});
projectionRoutes.post(W+'/notifications/read-all',async c=>{empty(c);return c.json(operations.readAllNotifications.response.parse({data:await readAllNotifications(r(c),s(c),Date.now())}));});
projectionRoutes.patch(W+'/notifications/:notificationId',async c=>{const input=operations.updateNotification.request.parse({workspaceId:s(c).workspaceId,notificationId:id(c,'notificationId'),body:await body(c)});return c.json(operations.updateNotification.response.parse({data:await updateNotification(r(c),s(c),input.notificationId,input.body.read,Date.now())}));});
projectionRoutes.get(W+'/projects/:projectId/views',async c=>{empty(c);return c.json(operations.listSavedViews.response.parse({data:await listSavedViews(r(c),s(c),id(c,'projectId'))}));});
projectionRoutes.post(W+'/projects/:projectId/views',async c=>{const input=operations.createSavedView.request.parse({workspaceId:s(c).workspaceId,projectId:id(c,'projectId'),body:await body(c)});return c.json(operations.createSavedView.response.parse({data:await createSavedView(r(c),s(c),input.projectId,input.body,Date.now())}),201);});
for(const [method,op,remove]of [['patch','updateSavedView',false],['delete','deleteSavedView',true]] as const)projectionRoutes[method](W+'/views/:viewId',async c=>{const input=operations[op].request.parse({workspaceId:s(c).workspaceId,viewId:id(c,'viewId'),body:await body(c)});return c.json(operations[op].response.parse({data:await changeSavedView(r(c),s(c),input.viewId,input.body,Date.now(),remove)}));});
for(const [method,op,add]of [['put','addProjectFavorite',true],['delete','removeProjectFavorite',false]] as const)projectionRoutes[method](W+'/me/project-favorites/:projectId',async c=>{empty(c);return c.json(operations[op].response.parse({data:await favoriteProject(r(c),s(c),id(c,'projectId'),add,Date.now())}));});
projectionRoutes.put(W+'/me/project-order',async c=>{const input=operations.updateProjectOrder.request.parse({workspaceId:s(c).workspaceId,body:await body(c)});return c.json(operations.updateProjectOrder.response.parse({data:await projectOrder(r(c),s(c),input.body.projectIds)}));});
