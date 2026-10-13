import { ApiErrorSchema, operations } from "@studio/contracts/api";
import { StudioApiError, StudioTransportError } from "../errors.ts";
import { createStudioClient } from "../operations.ts";
import type { StudioClient } from "../operations.ts";
import type { AuthFacade } from "../auth.ts";

export interface HttpApiOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  expectedSessionId?: () => string | undefined;
  auth?: () => AuthFacade;
}
const changed = () =>
  new StudioApiError({
    error: {
      code: "SESSION_CHANGED",
      message: "The browser session has changed. Please try again.",
    },
  });
export function createHttpClient({
  baseUrl = "/api/v1",
  fetch: fetcher = globalThis.fetch,
  expectedSessionId,
  auth,
}: HttpApiOptions = {}): StudioClient {
  if (!/^\/api(?:\/[A-Za-z0-9_-]+)*$/.test(baseUrl))
    throw new TypeError("HTTP API requires an origin-relative /api path");
  return createStudioClient(
    async (id, input, options) => {
      const operation = operations[id],
        facade = auth?.(),
        snapshot = facade?.snapshot();
      const intent = options.authIntent ?? snapshot;
      const assertCurrent = () => {
        options.signal?.throwIfAborted();
        if (facade && intent?.generation !== facade.generation) throw changed();
      };
      assertCurrent();
      const isAuth =
        id === "authLogin" || id === "authRefresh" || id === "authLogout";
      if (operation.method !== "GET" && !isAuth) {
        try {
          await facade?.beforeMutation();
        } catch (error) {
          if (
            error instanceof StudioApiError &&
            error.detail.code === "SESSION_CHANGED"
          )
            await facade?.changed(intent?.generation ?? facade.generation);
          throw error;
        }
        assertCurrent();
      }
      const expected =
        operation.method !== "GET" && id !== "authLogin"
          ? (intent?.sessionId ?? expectedSessionId?.())
          : undefined;
      let path = operation.path
        .replace("/api/v1", baseUrl)
        .replace(/\{(\w+)\}/g, (_, key: string) =>
          encodeURIComponent(String(input[key])),
        );
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(
        (input.query ?? {}) as Record<string, unknown>,
      ))
        if (value !== undefined)
          query.set(
            key,
            typeof value === "object" ? JSON.stringify(value) : String(value),
          );
      if (query.size) path += "?" + query;
      let body: BodyInit | undefined;
      if (id === "uploadProjectFile") {
        const upload = operations.uploadProjectFile.request.parse(input).body,
          form = new FormData();
        form.set(
          "file",
          new Blob([upload.file.bytes.slice().buffer], {
            type: upload.file.mimeType,
          }),
          upload.file.name,
        );
        form.set("clientRequestId", upload.clientRequestId);
        if (upload.taskId) form.set("taskId", upload.taskId);
        body = form;
      } else if (input.body) body = JSON.stringify(input.body);
      const signals = [options.signal, snapshot?.signal].filter(
        (value): value is AbortSignal => value !== undefined,
      );
      const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
      const send = async () => {
        assertCurrent();
        try {
          return await fetcher(path, {
            method: operation.method,
            credentials: "same-origin",
            headers: {
              Accept:
                operation.transport === "bytes" ? "*/*" : "application/json",
              ...((input.body || id === "authRefresh" || id === "authLogout") &&
              id !== "uploadProjectFile"
                ? { "Content-Type": "application/json" }
                : {}),
              ...(expected ? { "X-Task8-Session-Id": expected } : {}),
            },
            ...(body ? { body } : {}),
            ...(signal ? { signal } : {}),
          });
        } catch (error) {
          assertCurrent();
          if (signal?.aborted) throw signal.reason;
          if (error instanceof DOMException && error.name === "AbortError")
            throw error;
          throw new StudioTransportError(
            "network",
            "Could not reach the HTTP API",
          );
        }
      };
      let response = await send();
      assertCurrent();
      if (response.status === 401 && operation.method === "GET" && facade) {
        const rejected = await response.json().catch(() => undefined);
        assertCurrent();
        const original = ApiErrorSchema.safeParse(rejected);
        try {
          await facade.refresh();
        } catch (error) {
          if (
            error instanceof StudioApiError &&
            error.detail.code === "SESSION_CHANGED"
          )
            await facade.changed(intent?.generation ?? facade.generation);
          if (
            error instanceof StudioApiError &&
            error.detail.code === "CAPABILITY_UNAVAILABLE" &&
            original.success
          )
            throw new StudioApiError(original.data, 401);
          throw error;
        }
        assertCurrent();
        response = await send();
      }
      assertCurrent();
      if (id === "getFileContent" && response.ok) {
        if (response.status !== 200)
          throw new StudioTransportError(
            "invalidResponse",
            "Unexpected content status",
          );
        const disposition = response.headers.get("content-disposition") ?? "",
          encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        if (!encoded)
          throw new StudioTransportError(
            "invalidResponse",
            "Content filename is missing",
          );
        let name: string;
        try {
          name = decodeURIComponent(encoded);
        } catch {
          throw new StudioTransportError(
            "invalidResponse",
            "Content filename is invalid",
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        assertCurrent();
        return {
          bytes,
          contentType:
            response.headers.get("content-type") ?? "application/octet-stream",
          disposition: disposition.startsWith("inline")
            ? "inline"
            : "attachment",
          name,
        };
      }
      let result: unknown;
      try {
        result = await response.json();
      } catch {
        throw new StudioTransportError(
          "invalidResponse",
          "HTTP API did not return JSON",
        );
      }
      assertCurrent();
      if (!response.ok) {
        const parsed = ApiErrorSchema.safeParse(result);
        if (!parsed.success)
          throw new StudioTransportError(
            "invalidResponse",
            "HTTP API returned an invalid error",
          );
        if (parsed.data.error.code === "SESSION_CHANGED")
          await facade?.changed(intent?.generation ?? facade.generation);
        throw new StudioApiError(parsed.data, response.status);
      }
      if (
        !(operation.successStatuses as readonly number[]).includes(
          response.status,
        )
      )
        throw new StudioTransportError(
          "invalidResponse",
          "Unexpected HTTP success status",
        );
      if (id === "getSession") {
        const session = operations.getSession.response.safeParse(result);
        if (
          !session.success ||
          session.data.data.capabilities.dataMode !== "http"
        )
          throw new StudioTransportError(
            "invalidResponse",
            "HTTP session must advertise HTTP capabilities",
          );
        await facade?.observeSession(session.data);
      }
      return result;
    },
    auth
      ? () => {
          const snapshot = auth().snapshot();
          return {
            authIntent: {
              generation: snapshot.generation,
              sessionId: snapshot.sessionId,
            },
          };
        }
      : undefined,
    auth ? (intent) => intent.generation === auth().generation : undefined,
  );
}
export function createHttpApi(options: HttpApiOptions = {}) {
  return createHttpClient(options).api;
}
