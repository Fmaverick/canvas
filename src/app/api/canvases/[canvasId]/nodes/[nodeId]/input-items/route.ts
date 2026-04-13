import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  listInputNodeItems,
  listInputNodeItemsInputSchema,
  saveInputNodeItems,
  saveInputNodeItemsInputSchema,
} from "@/application/services/combination-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
    nodeId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { canvasId, nodeId } = await context.params;
    const result = await listInputNodeItems(
      listInputNodeItemsInputSchema.parse({
        workspaceId,
        canvasId,
        nodeId,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { canvasId, nodeId } = await context.params;
    const body = await request.json();
    const result = await saveInputNodeItems(
      saveInputNodeItemsInputSchema.parse({
        workspaceId,
        canvasId,
        nodeId,
        items: body.items,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";
