import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  reorderInputNodeItems,
  reorderInputNodeItemsInputSchema,
} from "@/application/services/combination-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
    nodeId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { canvasId, nodeId } = await context.params;
    const body = await request.json();
    const result = await reorderInputNodeItems(
      reorderInputNodeItemsInputSchema.parse({
        workspaceId,
        canvasId,
        nodeId,
        itemIds: body.itemIds ?? body.item_ids,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
