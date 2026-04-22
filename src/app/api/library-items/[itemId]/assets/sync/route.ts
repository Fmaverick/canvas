import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  syncLibraryItemAssets,
  syncLibraryItemAssetsInputSchema,
} from "@/application/services/library-item-asset-sync-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json().catch(() => ({}));
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, body?.workspaceId, "generate");
    const { itemId } = await context.params;
    const result = await syncLibraryItemAssets(
      syncLibraryItemAssetsInputSchema.parse({
        workspaceId,
        itemId,
        assetIds: body?.assetIds,
        pollAttempts: body?.pollAttempts,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
