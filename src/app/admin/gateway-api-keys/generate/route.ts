import { z } from "zod";

import { getRequestId, jsonError } from "@/lib/api";
import { requireAdminSession } from "@/lib/gateway-admin";
import { generateGatewayClientKeys, listGatewayClientKeys } from "@/lib/gateway-client-keys";

const payloadSchema = z.object({
  count: z.coerce.number().int().min(1).max(20).default(1),
});

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    requireAdminSession(request);
    const payload = payloadSchema.parse(await request.json());
    const generatedKeys = generateGatewayClientKeys(payload.count);

    return Response.json({
      ok: true,
      generatedKeys,
      gatewayApiKeys: listGatewayClientKeys(),
      request_id: requestId,
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
