import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { env } from "@/lib/env";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const workspaceIdSchema = z.uuid();

export function getRequestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function requireWorkspaceId(request: Request) {
  const workspaceId = request.headers.get("x-workspace-id");
  const parsed = workspaceIdSchema.safeParse(workspaceId);

  if (!parsed.success) {
    throw new ApiError(400, "WORKSPACE_ID_REQUIRED", "Missing or invalid X-Workspace-Id header.");
  }

  return parsed.data;
}

export function requireInternalAccess(request: Request) {
  if (!env.internalApiToken) {
    if (env.nodeEnv !== "production") {
      return true;
    }

    throw new ApiError(500, "INTERNAL_TOKEN_MISSING", "Missing INTERNAL_API_TOKEN for internal endpoint.");
  }

  const internalToken = request.headers.get("x-internal-token");

  if (internalToken !== env.internalApiToken) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid internal access token.");
  }

  return true;
}

export function jsonSuccess(data: unknown, requestId: string, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      error: null,
      request_id: requestId,
    },
    { status },
  );
}

export function jsonError(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: error.code,
          message: error.message,
        },
        request_id: requestId,
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message ?? "Invalid request payload.",
        },
        request_id: requestId,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown server error.",
      },
      request_id: requestId,
    },
    { status: 500 },
  );
}
