import { z } from 'zod';
import type { ApiEnvironment } from '../../src/runtime.ts';
export type ProbeEnvironment = ApiEnvironment['Bindings'] & {
  BARRIER: Fetcher;
  DRIVER_KEY: string;
};
export type ProbeCommands = Record<string, (...args: never[]) => Promise<unknown>>;
const Input = z.object({ method: z.string(), args: z.array(z.unknown()).max(8) });
// Only this isolated test entry imports the dispatcher. Production has no test routes.
export async function dispatch(
  request: Request,
  key: string,
  run: (method: string, args: unknown[]) => Promise<unknown>,
): Promise<Response> {
  if (request.method !== 'POST' || request.headers.get('x-fixture-key') !== key)
    return new Response(null, { status: 404 });
  if (Number(request.headers.get('content-length') ?? 0) > 1048576)
    return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 1048576) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const input = Input.parse(JSON.parse(new TextDecoder().decode(bytes)));
    return Response.json({ ok: true, result: await run(input.method, input.args) });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        name: error instanceof Error ? error.name : 'Error',
        causeStatus:
          error instanceof Error && error.cause instanceof Response ? error.cause.status : null,
        causePath:
          error instanceof Error && error.cause instanceof Response && error.cause.url
            ? new URL(error.cause.url).pathname
            : null,
        code:
          error instanceof Error &&
          'code' in error &&
          typeof error.code === 'string' &&
          /^[A-Z0-9_-]{1,80}$/iu.test(error.code)
            ? error.code
            : null,
      },
      { status: 500 },
    );
  }
}
