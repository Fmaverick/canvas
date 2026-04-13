import { z } from "zod";

import { ApiError, getRequestId, jsonError } from "@/lib/api";
import { requireAdminSession } from "@/lib/gateway-admin";
import { updateProviderConfig } from "@/lib/gateway-provider-registry";

type RouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

const updateProviderPayloadSchema = z.object({
  baseUrl: z.url().optional(),
  keys: z.array(z.string().min(1)).optional(),
  available: z.boolean().optional(),
  readOnly: z.boolean().optional(),
});

function readAndUpdateProvider(provider: string, payload: unknown) {
  const parsed = updateProviderPayloadSchema.parse(payload);

  if (
    parsed.baseUrl === undefined &&
    parsed.keys === undefined &&
    parsed.available === undefined &&
    parsed.readOnly === undefined
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "At least one field is required to update provider.");
  }

  return updateProviderConfig({
    provider,
    baseUrl: parsed.baseUrl,
    keys: parsed.keys,
    available: parsed.available,
    readOnly: parsed.readOnly,
  });
}

async function handleRequest(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    requireAdminSession(request);
    const { provider } = await context.params;
    const providerView = readAndUpdateProvider(provider, await request.json());

    return Response.json({
      ok: true,
      provider: providerView,
      request_id: requestId,
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return handleRequest(request, context);
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
