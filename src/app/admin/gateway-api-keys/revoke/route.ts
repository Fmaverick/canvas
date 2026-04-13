import { z } from "zod";

import { getRequestId, jsonError } from "@/lib/api";
import { requireAdminSession } from "@/lib/gateway-admin";
import { listGatewayClientKeys, revokeGatewayClientKey } from "@/lib/gateway-client-keys";

const payloadSchema = z.object({
  key: z.string().min(1),
});

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    requireAdminSession(request);
    const payload = payloadSchema.parse(await request.json());
    revokeGatewayClientKey(payload.key);

    return Response.json({
      ok: true,
      gatewayApiKeys: listGatewayClientKeys(),
      request_id: requestId,
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
