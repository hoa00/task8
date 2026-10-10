import { Hono } from 'hono';
import { EntityIdSchema, operations } from '@studio/contracts/api';
import { ApiFailure } from '../errors.ts';
import { changeFile, fileDto, fileRow, listFiles, safeInline, uploadFile } from './files.ts';
import type { ApiEnvironment } from '../runtime.ts';
import type { Context } from 'hono';
type C=Context<ApiEnvironment>;
function query(c:C) {const result:Record<string,unknown>={};for(const [key,values]of Object.entries(c.req.queries())){if(values.length!==1)throw new ApiFailure('VALIDATION_ERROR','Repeated query field');result[key]=key==='limit'?Number(values[0]):values[0];}if(c.req.method==='GET'&&(Number(c.req.header('content-length')??0)>0||c.req.header('transfer-encoding')))throw new ApiFailure('VALIDATION_ERROR','Read does not accept a body');return result;}
async function body(c:C) {if(Object.keys(c.req.query()).length||!c.req.header('content-type')?.startsWith('application/json'))throw new ApiFailure('VALIDATION_ERROR','JSON body required');try{return await c.req.json();}catch{throw new ApiFailure('VALIDATION_ERROR','Invalid JSON');}}
const prefix='/workspaces/:workspaceId',fid=(c:C)=>EntityIdSchema.parse(c.req.param('fileId'));
export const fileRoutes=new Hono<ApiEnvironment>();
fileRoutes.get(prefix+'/projects/:projectId/files',async c=>{const input=operations.listProjectFiles.request.parse({workspaceId:c.get('workspace').workspaceId,projectId:c.req.param('projectId'),query:query(c)});return c.json(operations.listProjectFiles.response.parse({data:await listFiles(c.get('repository'),c.get('workspace'),input.projectId,input.query)}));});
fileRoutes.get(prefix+'/files/:fileId',async c=>{operations.getFile.request.parse({workspaceId:c.get('workspace').workspaceId,fileId:fid(c)});if(Object.keys(query(c)).length)throw new ApiFailure('VALIDATION_ERROR','Unexpected query');return c.json(operations.getFile.response.parse({data:fileDto(await fileRow(c.get('repository'),c.get('workspace'),fid(c)))}));});
fileRoutes.post(prefix+'/projects/:projectId/files',async c=>{
  if(Object.keys(c.req.query()).length||!c.req.header('content-type')?.startsWith('multipart/form-data'))throw new ApiFailure('VALIDATION_ERROR','Multipart file required');
  if(Number(c.req.header('content-length')??0)>10485760+65536)throw new ApiFailure('PAYLOAD_TOO_LARGE','Upload exceeds 10 MiB');
  // Bound the actual multipart body too; Content-Length is not trusted.
  const reader=c.req.raw.body?.getReader();if(!reader)throw new ApiFailure('VALIDATION_ERROR','File required');const chunks:Uint8Array[]=[],cap=10485760+65536;let length=0;
  for(;;){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>cap){await reader.cancel();throw new ApiFailure('PAYLOAD_TOO_LARGE','Upload exceeds 10 MiB');}chunks.push(item.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let form:FormData;try{form=await new Response(bytes,{headers:{'content-type':c.req.header('content-type')!}}).formData();}catch{throw new ApiFailure('VALIDATION_ERROR','Invalid multipart');}
  for(const key of form.keys())if(!['file','clientRequestId','taskId'].includes(key)||form.getAll(key).length!==1)throw new ApiFailure('VALIDATION_ERROR','Unexpected multipart field');
  const file=form.get('file');if(!(file instanceof File))throw new ApiFailure('VALIDATION_ERROR','Exactly one file required');if(file.size>10485760)throw new ApiFailure('PAYLOAD_TOO_LARGE','File exceeds 10 MiB');
  const input=operations.uploadProjectFile.request.parse({workspaceId:c.get('workspace').workspaceId,projectId:c.req.param('projectId'),body:{clientRequestId:form.get('clientRequestId'),...(form.has('taskId')?{taskId:form.get('taskId')}:{}),file:{name:file.name,mimeType:file.type||'application/octet-stream',bytes:new Uint8Array(await file.arrayBuffer())}}});
  const result=await uploadFile(c.get('repository'),c.get('workspace'),c.env.FILES,input.projectId,input.body,Date.now());return c.json(operations.uploadProjectFile.response.parse({data:result.file}),result.created?201:200);
});
fileRoutes.get(prefix+'/files/:fileId/content',async c=>{
  const input=operations.getFileContent.request.parse({workspaceId:c.get('workspace').workspaceId,fileId:fid(c),query:query(c)}),f=await fileRow(c.get('repository'),c.get('workspace'),input.fileId);
  if(f.storageMode!=='r2'||!f.objectKey)throw new ApiFailure('NOT_FOUND','Sample file has no original bytes');const object=await c.env.FILES.get(f.objectKey);if(!object)throw new ApiFailure('NOT_FOUND','File bytes not found');
  const disposition=input.query.disposition==='inline'&&safeInline(f.mimeType!)?'inline':'attachment';
  return new Response(object.body,{headers:{'Content-Type':f.mimeType!,'Content-Length':String(object.size),'Content-Disposition':`${disposition}; filename="download"; filename*=UTF-8''${encodeURIComponent(f.name)}`,'ETag':object.httpEtag,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'private, no-store'}});
});
for(const [op,method,suffix,kind]of [['renameFile','patch','','rename'],['deleteFile','delete','','delete'],['restoreDeletedFile','post','/restore-deleted','restore'],['duplicateFile','post','/duplicate','duplicate']] as const)fileRoutes[method](prefix+'/files/:fileId'+suffix,async c=>{const input=operations[op].request.parse({workspaceId:c.get('workspace').workspaceId,fileId:fid(c),body:await body(c)}),result=await changeFile(c.get('repository'),c.get('workspace'),c.env.FILES,input.fileId,input.body.expectedVersion,kind,'name'in input.body&&typeof input.body.name==='string'?input.body.name:undefined,Date.now());return c.json(operations[op].response.parse({data:op==='deleteFile'?result:result.file}));});
