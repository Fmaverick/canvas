import { NextResponse } from "next/server";

import { getRequestId, jsonError } from "@/lib/api";
import { isAdminPasswordEnabled, requireAdminSession } from "@/lib/gateway-admin";
import { getGatewayClientKeyCount, listGatewayClientKeys } from "@/lib/gateway-client-keys";
import { listProviderStatuses } from "@/lib/gateway-provider-registry";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    requireAdminSession(request);

    return NextResponse.json({
      auth: {
        passwordEnabled: isAdminPasswordEnabled(),
        gatewayApiKeyCount: getGatewayClientKeyCount(),
      },
      gatewayApiKeys: listGatewayClientKeys(),
      providers: listProviderStatuses(),
      request_id: requestId,
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
