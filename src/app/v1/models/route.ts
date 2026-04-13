import { NextResponse } from "next/server";

import { listGatewayModels } from "@/lib/gateway-provider-registry";

export async function GET() {
  return NextResponse.json({
    data: listGatewayModels(),
  });
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
