import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { deleteAsset } from "@/application/services/asset-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    itemId: string;
    assetId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { itemId, assetId } = await context.params;
    const asset = await deleteAsset({
      workspaceId,
      assetId,
      ownerType: "library_item",
      ownerId: itemId,
    });

    return jsonSuccess(asset, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
