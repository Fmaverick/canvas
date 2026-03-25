import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { listAssetsByOwner } from "@/application/services/asset-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { itemId } = await context.params;
    const assets = await listAssetsByOwner({
      workspaceId,
      ownerType: "library_item",
      ownerId: itemId,
    });

    return jsonSuccess(assets, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
