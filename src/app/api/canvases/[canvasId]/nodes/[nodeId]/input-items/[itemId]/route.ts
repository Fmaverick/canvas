import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  updateInputNodeItem,
  updateInputNodeItemInputSchema,
} from "@/application/services/combination-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
    nodeId: string;
    itemId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { canvasId, nodeId, itemId } = await context.params;
    const body = await request.json();
    const result = await updateInputNodeItem(
      updateInputNodeItemInputSchema.parse({
        workspaceId,
        canvasId,
        nodeId,
        itemId,
        enabled: body.enabled,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
