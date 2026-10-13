import { EntityIdSchema } from "@studio/contracts/api";
import type { StudioClient } from "../data/operations.ts";
import { StudioApiError } from "../data/errors.ts";

export function safeReturnPath(input: unknown): string | undefined {
  if (
    typeof input !== "string" ||
    input.length > 2048 ||
    !input.startsWith("/") ||
    input.startsWith("//") ||
    input.includes("\\")
  )
    return undefined;
  const url = new URL(input, "https://task8.internal");
  if (
    url.origin !== "https://task8.internal" ||
    (url.pathname !== "/" && !url.pathname.startsWith("/w/"))
  )
    return undefined;
  return url.pathname + url.search + url.hash;
}
export async function allowedReturnPath(
  client: StudioClient,
  input: unknown,
): Promise<string> {
  const path = safeReturnPath(input);
  if (!path || path === "/") return "/";
  const url = new URL(path, "https://task8.internal");
  const workspace = url.pathname.match(/^\/w\/([^/]+)(?:\/|$)/u)?.[1];
  if (!EntityIdSchema.safeParse(workspace).success) return "/";
  try {
    await client.execute("getBootstrap", {
      workspaceId: EntityIdSchema.parse(workspace),
    });
    const project = url.pathname.match(
      /^\/w\/[^/]+\/projects\/([^/]+)(?:\/|$)/u,
    )?.[1];
    if (project && EntityIdSchema.safeParse(project).success)
      await client.execute("getProject", {
        workspaceId: EntityIdSchema.parse(workspace),
        projectId: EntityIdSchema.parse(project),
      });
    return path;
  } catch (error) {
    if (
      error instanceof StudioApiError &&
      (error.status === 403 || error.status === 404)
    )
      return "/";
    throw error;
  }
}
