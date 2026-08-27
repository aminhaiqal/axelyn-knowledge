import { randomUUID } from "node:crypto";
import { ZodError, type ZodType } from "zod";
import {
  authenticateServiceRequest,
  authorizeWorkspace,
  type ServiceIdentity,
} from "@/src/auth/service-auth";
import { MAX_JSON_BODY_BYTES } from "@/src/config";
import { AppError, badRequest, payloadTooLarge } from "@/src/domain/errors";
import { WorkspaceIdSchema } from "@/src/domain/schemas";
import { logger } from "@/src/lib/logger";

export interface ApiContext {
  identity: ServiceIdentity;
  requestId: string;
}

export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
  maximumBytes = MAX_JSON_BODY_BYTES,
): Promise<T> {
  let body: unknown;
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      throw payloadTooLarge(maximumBytes);
    }
    if (!request.body) throw new Error("Missing body");
    const reader = request.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let receivedBytes = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) {
        await reader.cancel();
        throw payloadTooLarge(maximumBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    body = JSON.parse(text);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw badRequest("INVALID_JSON", "The request body must be valid JSON.");
  }
  return schema.parse(body);
}

export function resolveWorkspace(
  request: Request,
  identity: ServiceIdentity,
  explicit?: string | null,
) {
  const url = new URL(request.url);
  const candidate =
    explicit ?? request.headers.get("x-workspace-id") ?? url.searchParams.get("workspace_id");
  const workspaceId =
    candidate ?? (identity.workspaces.length === 1 ? identity.workspaces[0] : null);
  if (!workspaceId) {
    throw badRequest("WORKSPACE_REQUIRED", "Specify workspace_id or the X-Workspace-Id header.");
  }
  const parsed = WorkspaceIdSchema.parse(workspaceId);
  authorizeWorkspace(identity, parsed);
  return parsed;
}

export async function apiRoute(
  request: Request,
  handler: (context: ApiContext) => Promise<Response>,
): Promise<Response> {
  const requestId: string = request.headers.get("x-request-id")?.slice(0, 100) || randomUUID();
  try {
    const identity = authenticateServiceRequest(request);
    return await handler({ identity, requestId });
  } catch (error) {
    return apiError(error, requestId);
  }
}

export function apiError(error: unknown, requestId: string = randomUUID()) {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request did not pass validation.",
          details: error.issues,
        },
        request_id: requestId,
      },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        request_id: requestId,
      },
      { status: error.status, headers: { "x-request-id": requestId } },
    );
  }
  const pgCode =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
  if (pgCode === "23503" || pgCode === "23514") {
    return Response.json(
      {
        error: {
          code: "DATABASE_CONSTRAINT",
          message: "The operation violates a knowledge integrity boundary.",
        },
        request_id: requestId,
      },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }
  if (pgCode === "22P02") {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "A resource identifier or typed value is invalid.",
        },
        request_id: requestId,
      },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }
  logger.error("api.unhandled_error", {
    request_id: requestId,
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return Response.json(
    {
      error: { code: "INTERNAL_ERROR", message: "The request could not be completed." },
      request_id: requestId,
    },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}
