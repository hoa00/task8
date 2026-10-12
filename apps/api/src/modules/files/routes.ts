import { EntityIdSchema, operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  jsonBody as body,
  multipartBody,
  parseRequest,
  readQuery as query,
} from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import { ApiFailure, required } from '../../shared/errors.ts';
import { apiLimits } from '../../shared/limits.ts';
import {
  changeFile,
  fileContent,
  fileDto,
  fileRow,
  listFiles,
  safeInline,
  uploadFile,
} from './index.ts';
type C = Context<ApiEnvironment>;

const prefix = '/workspaces/:workspaceId',
  fid = (c: C) => parseRequest(EntityIdSchema, c.req.param('fileId'));
export const fileRoutes = new Hono<ApiEnvironment>();
fileRoutes.get(prefix + '/projects/:projectId/files', async (c) => {
  const input = parseRequest(operations.listProjectFiles.request, {
    workspaceId: c.get('workspace').workspaceId,
    projectId: c.req.param('projectId'),
    query: await query(c),
  });
  return c.json(
    operations.listProjectFiles.response.parse({
      data: await listFiles(c.get('repository'), c.get('workspace'), input.projectId, input.query),
    }),
  );
});
fileRoutes.get(prefix + '/files/:fileId', async (c) => {
  parseRequest(operations.getFile.request, {
    workspaceId: c.get('workspace').workspaceId,
    fileId: fid(c),
  });
  if (Object.keys(await query(c)).length)
    throw new ApiFailure('VALIDATION_ERROR', 'Unexpected query');
  return c.json(
    operations.getFile.response.parse({
      data: fileDto(await fileRow(c.get('repository'), c.get('workspace'), fid(c))),
    }),
  );
});
fileRoutes.post(prefix + '/projects/:projectId/files', async (c) => {
  const form = await multipartBody(c);
  const file = form.get('file');
  if (!(file instanceof File))
    throw new ApiFailure('VALIDATION_ERROR', 'Exactly one file required');
  if (file.size > apiLimits.maxUploadBytes)
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'File exceeds 10 MiB');
  const input = parseRequest(operations.uploadProjectFile.request, {
    workspaceId: c.get('workspace').workspaceId,
    projectId: c.req.param('projectId'),
    body: {
      clientRequestId: form.get('clientRequestId'),
      ...(form.has('taskId') ? { taskId: form.get('taskId') } : {}),
      file: {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    },
  });
  const result = await uploadFile(
    c.get('repository'),
    c.get('workspace'),
    c.get('fileStorage'),
    input.projectId,
    input.body,
    serverClock.now(),
    undefined,
    c.get('diagnostics'),
  );
  return c.json(
    operations.uploadProjectFile.response.parse({ data: result.file }),
    result.created ? 201 : 200,
  );
});
fileRoutes.get(prefix + '/files/:fileId/content', async (c) => {
  const input = parseRequest(operations.getFileContent.request, {
      workspaceId: c.get('workspace').workspaceId,
      fileId: fid(c),
      query: await query(c),
    }),
    { file: f, object } = await fileContent(
      c.get('repository'),
      c.get('workspace'),
      c.get('fileStorage'),
      input.fileId,
    );
  const disposition =
    input.query.disposition === 'inline' &&
    safeInline(required(f.mimeType, 'Missing file media type'))
      ? 'inline'
      : 'attachment';
  return new Response(object.body, {
    headers: {
      'Content-Type': required(f.mimeType, 'Missing file media type'),
      'Content-Length': String(object.size),
      'Content-Disposition': `${disposition}; filename="download"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      ETag: object.httpEtag,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
    },
  });
});
for (const [op, method, suffix, kind] of [
  ['renameFile', 'patch', '', 'rename'],
  ['deleteFile', 'delete', '', 'delete'],
  ['restoreDeletedFile', 'post', '/restore-deleted', 'restore'],
  ['duplicateFile', 'post', '/duplicate', 'duplicate'],
] as const)
  fileRoutes[method](prefix + '/files/:fileId' + suffix, async (c) => {
    const input = parseRequest(operations[op].request, {
        workspaceId: c.get('workspace').workspaceId,
        fileId: fid(c),
        body: await body(c),
      }),
      result = await changeFile(
        c.get('repository'),
        c.get('workspace'),
        c.get('fileStorage'),
        input.fileId,
        kind === 'rename'
          ? {
              kind,
              expectedVersion: input.body.expectedVersion,
              name: parseRequest(z.string(), 'name' in input.body ? input.body.name : undefined),
            }
          : kind === 'duplicate'
            ? {
                kind,
                expectedVersion: input.body.expectedVersion,
                ...('name' in input.body && input.body.name !== undefined
                  ? { name: input.body.name }
                  : {}),
              }
            : { kind, expectedVersion: input.body.expectedVersion },
        serverClock.now(),
        undefined,
        c.get('diagnostics'),
      );
    return c.json(
      operations[op].response.parse({ data: op === 'deleteFile' ? result : result.file }),
    );
  });
